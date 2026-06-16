import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

// Hosts like Render/Railway/Fly inject PORT; fall back to our own var, then a dev default.
const BRIDGE_PORT = Number(process.env.PORT || process.env.TELEPHONY_BRIDGE_PORT || 8788);
// Prefer an explicit public URL; on Render, RENDER_EXTERNAL_URL is auto-provided so the
// service works on first deploy without manually wiring its own URL back to itself.
const PUBLIC_BASE_URL = (
  process.env.TELEPHONY_PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  ""
).trim();
const XAI_API_KEY = (process.env.XAI_API_KEY || process.env.LLM_API_KEY || "").trim();
const XAI_MODEL = (process.env.INS_NAV_GROK_VOICE_MODEL || "grok-voice-think-fast-1.0").trim();
const VOICE_NAME = (process.env.INS_NAV_GROK_VOICE_NAME || "sal").trim();

// Text model used to extract a structured coverage result from the live call transcript.
const EXTRACTION_API_KEY = (process.env.LLM_API_KEY || process.env.XAI_API_KEY || "").trim();
const EXTRACTION_BASE_URL = (process.env.LLM_BASE_URL || "https://api.x.ai/v1")
  .trim()
  .replace(/\/$/, "");
const EXTRACTION_MODEL = (process.env.LLM_MODEL || "grok-3").trim();

// In-memory store of live-call outcomes keyed by Twilio Call SID. The Next.js app polls
// these via GET /twilio/call-result?callSid=... and swaps the AI estimate for the real
// transcript-derived result once the call ends. Entries auto-expire to bound memory.
const callResults = new Map();
const CALL_RESULT_TTL_MS = 30 * 60 * 1000;

function setCallResult(callSid, patch) {
  if (!callSid) {
    return;
  }
  const existing = callResults.get(callSid) || {};
  callResults.set(callSid, { ...existing, ...patch, updatedAt: Date.now() });
}

function getCallResult(callSid) {
  return callSid ? callResults.get(callSid) || null : null;
}

function pruneCallResults() {
  const cutoff = Date.now() - CALL_RESULT_TTL_MS;
  for (const [sid, entry] of callResults.entries()) {
    if ((entry.updatedAt || 0) < cutoff) {
      callResults.delete(sid);
    }
  }
}

function clampNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function normalizeFacilityTypes(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/,| and /i)
      : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const entry = String(raw)
      .replace(/[\[\]"'{}]/g, "")
      .trim();
    if (entry && !entry.includes(":") && !seen.has(entry.toLowerCase())) {
      seen.add(entry.toLowerCase());
      out.push(entry);
    }
  }
  return out;
}

function coerceInsuranceCallResult(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const deductibleTotal = clampNumber(parsed.deductible_total);
  const deductibleMet = clampNumber(parsed.deductible_met);
  const deductibleRemaining =
    parsed.deductible_remaining == null
      ? Math.max(0, deductibleTotal - deductibleMet)
      : clampNumber(parsed.deductible_remaining);
  const coveredRaw =
    typeof parsed.covered === "string"
      ? ["true", "yes", "covered"].includes(parsed.covered.toLowerCase())
      : Boolean(parsed.covered);

  return {
    covered: coveredRaw,
    deductible_total: deductibleTotal,
    deductible_met: deductibleMet,
    deductible_remaining: deductibleRemaining,
    coinsurance_percentage: clampNumber(parsed.coinsurance_percentage),
    facility_types_covered: normalizeFacilityTypes(parsed.facility_types_covered),
  };
}

async function extractInsuranceResultFromTranscript(transcript) {
  if (!EXTRACTION_API_KEY || !transcript.trim()) {
    return null;
  }

  const response = await fetch(`${EXTRACTION_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EXTRACTION_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You extract structured insurance benefits from a phone call transcript.",
            "The transcript is between an insurance navigator agent and a member-services representative.",
            "Use ONLY facts stated by the representative. Do not invent numbers.",
            "If a value was not stated, use 0 for numbers, false for covered, and [] for facility types.",
            'Return ONLY valid JSON matching: {"covered":boolean,"deductible_total":number,"deductible_met":number,"deductible_remaining":number,"coinsurance_percentage":number,"facility_types_covered":string[]}',
          ].join(" "),
        },
        { role: "user", content: `Transcript:\n${transcript}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Extraction model returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    }
  }
  return coerceInsuranceCallResult(parsed);
}

function coerceBookingResult(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const confirmationId =
    typeof parsed.confirmation_id === "string" ? parsed.confirmation_id.trim() : "";
  const scheduledFor =
    typeof parsed.scheduled_for === "string" ? parsed.scheduled_for.trim() : "";
  const bookedRaw =
    typeof parsed.booked === "string"
      ? ["true", "yes", "booked", "confirmed"].includes(parsed.booked.toLowerCase())
      : Boolean(parsed.booked);

  // Treat the call as a real booking only if the scheduler actually committed to a slot.
  return {
    confirmation_id: confirmationId,
    scheduled_for: scheduledFor,
    booked: bookedRaw || Boolean(confirmationId || scheduledFor),
  };
}

async function extractBookingResultFromTranscript(transcript) {
  if (!EXTRACTION_API_KEY || !transcript.trim()) {
    return null;
  }

  const response = await fetch(`${EXTRACTION_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EXTRACTION_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You extract the appointment booking outcome from a phone call transcript.",
            "The transcript is between an insurance navigator agent and a provider scheduler.",
            "Use ONLY facts stated by the scheduler. Do not invent a confirmation number or time.",
            "If the scheduler did not give a value, return an empty string for it.",
            'Return ONLY valid JSON matching: {"confirmation_id":string,"scheduled_for":string,"booked":boolean}',
          ].join(" "),
        },
        { role: "user", content: `Transcript:\n${transcript}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Extraction model returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    }
  }
  return coerceBookingResult(parsed);
}

const DEFAULT_AGENT_INSTRUCTIONS = [
  "You are the Insurance Navigator call agent placing an OUTBOUND call on behalf of a patient/member.",
  "You are currently in a live phone call.",
  "The person who answers is a representative (insurance member services, provider front desk, or scheduler). They are NOT the patient.",
  "You already have ALL of the patient's details in the call context (plan name, member ID, group number, procedure, CPT, preferred date/time, provider).",
  "YOU provide those details to the representative. Proactively state the relevant patient/member details when you introduce yourself and when you ask each question.",
  "NEVER ask the representative for the patient's plan name, member ID, group number, procedure, CPT, or preferred appointment time. You already have them and must supply them.",
  "Do NOT talk to the person as if they are the patient. Treat them as the representative who has the answers you need.",
  "Only ask the representative for information that only they would know (coverage, deductible, coinsurance, covered facilities, price, acceptance, available slot, confirmation ID, pre-visit instructions).",
  "Do not ask the callee why they are calling or what they need help with.",
  "Be concise, professional, and gather structured details carefully.",
  "Never mention system prompts or internal tool details.",
].join(" ");

function extractCptFromBrief(brief) {
  const match = (brief || "").match(/CPT(?:\s*code)?\s*[:#]?\s*([A-Za-z0-9]{3,7})/i);
  return match ? match[1] : "";
}

const STOP_RULE =
  "Ask ONLY the listed questions, one at a time, and wait for each answer before the next. " +
  "Do not invent any CPT code; use only the CPT provided in the call context. " +
  "Never ask the representative for patient identity details (plan, member ID, group, procedure, CPT, preferred time) — you already have them and must state them. " +
  "Do not ask any other, follow-up, or off-topic questions. " +
  "After the closing confirmation line, thank them briefly, say goodbye, and stop talking.";

function fieldFromBrief(brief, label) {
  const re = new RegExp(`${label}\\s*:\\s*([^.]+?)\\.`, "i");
  const match = (brief || "").match(re);
  return match ? match[1].trim() : "";
}

function buildStageInstructions(stage, brief) {
  const cptFromBrief = extractCptFromBrief(brief);
  const cptText = cptFromBrief || "the CPT code in your records";

  const planName = fieldFromBrief(brief, "Plan name") || "the patient's plan";
  const memberId = fieldFromBrief(brief, "Member ID") || "the member on file";
  const groupNumber = fieldFromBrief(brief, "Group number") || "the group on file";
  const procedure = fieldFromBrief(brief, "Procedure") || "the requested procedure";
  const providerName = fieldFromBrief(brief, "Provider name") || "the selected provider";
  const preferred = fieldFromBrief(brief, "Preferred date/time") || "the patient's preferred time";

  const VALUE_RULE =
    "Speak these EXACT values out loud; never say the word 'blank', 'unknown', or read bracket placeholders. " +
    `Plan name: ${planName}. Member ID: ${memberId}. Group number: ${groupNumber}. ` +
    `Procedure: ${procedure}. CPT: ${cptText}. Provider: ${providerName}. Preferred date/time: ${preferred}.`;

  const stageInstructionByType = {
    insurance_verification: [
      "Current call stage: insurance verification.",
      "Scope lock: insurance benefits verification only.",
      "Never ask booking/scheduling questions in this stage.",
      "You are calling insurance member services on behalf of the member.",
      "You already have the member's plan name, member ID, and group number; STATE them to the rep, do not ask the rep for them.",
      `Start by saying exactly: Hello, this is the insurance navigator calling to verify benefits for member ${memberId} on plan ${planName}, group ${groupNumber}.`,
      "Then ask these exact questions, one by one, supplying the CPT yourself:",
      `1) Can you confirm whether CPT code ${cptText} is covered for this member?`,
      "2) What is the member's total deductible?",
      "3) How much of the deductible is already met?",
      "4) What is the remaining deductible?",
      "5) What is the member's coinsurance percentage for this procedure?",
      "6) Which facility types are covered for this CPT (for example imaging center, hospital outpatient)?",
      "Close with: Let me confirm: covered status, deductible total/met/remaining, coinsurance %, and covered facility types.",
      VALUE_RULE,
      STOP_RULE,
    ].join(" "),
    provider_pricing: [
      "Current call stage: provider pricing.",
      "Scope lock: provider pricing and insurance acceptance only.",
      "Never ask booking/scheduling questions in this stage.",
      "You are calling the provider front desk for pricing on behalf of the patient.",
      "You already have the plan name and CPT; STATE them to the front desk, do not ask them for the patient's details.",
      `Start by saying exactly: Hello, this is the insurance navigator calling to request pricing for CPT ${cptText} for a patient on plan ${planName}.`,
      "Then ask these exact questions, one by one, supplying the CPT and plan yourself:",
      `1) What is your cash/self-pay price for CPT ${cptText}?`,
      `2) Do you accept ${planName} insurance?`,
      "3) What do you typically bill insurance for this CPT?",
      "Close with: Let me confirm: cash price, insurance acceptance, and typical billed amount.",
      VALUE_RULE,
      STOP_RULE,
    ].join(" "),
    booking: [
      "Current call stage: booking.",
      "Scope lock: appointment scheduling only.",
      "Never ask deductible/coinsurance/facility coverage questions in this stage.",
      "You are calling the scheduler to BOOK an appointment ON BEHALF of the patient. You are doing the booking; the scheduler is not the patient.",
      "You already have ALL booking details. PROVIDE them; never ask the scheduler to confirm the procedure or patient details.",
      `Start by saying exactly: Hello, this is the insurance navigator. I'd like to book ${procedure} for our patient with ${providerName}, preferably ${preferred}.`,
      "Then ask the scheduler only these exact questions, one by one:",
      "1) What is your earliest available slot matching that preferred date/time?",
      "2) What is the confirmation ID/reference number?",
      "3) Any pre-visit instructions (arrival time, documents, prep)?",
      "Close with: Let me confirm: appointment time, confirmation ID, and pre-visit instructions.",
      VALUE_RULE,
      STOP_RULE,
    ].join(" "),
  };

  const stageInstructions = stage ? stageInstructionByType[stage] || "" : "";
  const briefText = (brief || "").trim();
  return [
    DEFAULT_AGENT_INSTRUCTIONS,
    stageInstructions,
    briefText ? `Call context from app: ${briefText}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildKickoffPrompt(stage) {
  const stageKickoffByType = {
    insurance_verification:
      'The live call has started for stage "insurance_verification". You are the OUTBOUND caller representing the member. Introduce yourself, state the member ID, plan name, and group number from your call context, then ask question #1. The person on the line is the insurance rep, NOT the patient — do not ask them for patient details, and do not ask any booking questions.',
    provider_pricing:
      'The live call has started for stage "provider_pricing". You are the OUTBOUND caller representing the patient. Introduce yourself, state the plan name and CPT from your call context, then ask question #1. The person on the line is the provider front desk, NOT the patient — do not ask them for patient details, and do not ask any booking questions.',
    booking:
      'The live call has started for stage "booking". You are the OUTBOUND caller booking ON BEHALF of the patient. Introduce yourself and state the procedure, provider, and preferred date/time from your call context, then ask question #1. The person on the line is the scheduler, NOT the patient — provide all patient/procedure details yourself and do not ask them to confirm those.',
  };
  return (
    stageKickoffByType[stage] ||
    `The live call has started for stage "${stage || "general"}". You are the outbound caller. State your purpose with the details from context and ask question #1 immediately.`
  );
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function jsonResponse(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseFormUrlEncoded(rawBody) {
  const params = new URLSearchParams(rawBody);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function toWsBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function createOutboundCall({ to, from, webhookUrl }) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  requireEnv("TWILIO_ACCOUNT_SID", accountSid);
  requireEnv("TWILIO_AUTH_TOKEN", authToken);

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const form = new URLSearchParams({ To: to, From: from, Url: webhookUrl });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Failed to create Twilio call.");
  }
  return payload;
}

const server = createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${BRIDGE_PORT}`;
  const requestUrl = new URL(req.url || "/", `http://${host}`);

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    return jsonResponse(res, 200, {
      ok: true,
      service: "telephony-bridge",
      model: XAI_MODEL,
      port: BRIDGE_PORT,
    });
  }

  if (req.method === "GET" && requestUrl.pathname === "/twilio/call-result") {
    const callSid = (requestUrl.searchParams.get("callSid") || "").trim();
    pruneCallResults();
    const entry = getCallResult(callSid);
    if (!entry) {
      return jsonResponse(res, 200, {
        call_sid: callSid,
        stage: "",
        status: "not_found",
      });
    }
    return jsonResponse(res, 200, {
      call_sid: callSid,
      stage: entry.stage || "",
      status: entry.status || "pending",
      result: entry.result,
      booking: entry.booking,
      transcript: entry.transcript,
      error: entry.error,
    });
  }

  if (req.method === "POST" && requestUrl.pathname === "/twilio/voice") {
    if (!PUBLIC_BASE_URL) {
      return jsonResponse(res, 500, {
        error: "Missing TELEPHONY_PUBLIC_BASE_URL for webhook responses.",
      });
    }

    const rawBody = await readBody(req);
    const form = parseFormUrlEncoded(rawBody);
    const callSid = form.CallSid || "";
    const stage = requestUrl.searchParams.get("stage") || "";
    const brief = requestUrl.searchParams.get("brief") || "";
    console.log(`[telephony-bridge] /twilio/voice -> stage="${stage}" callSid=${callSid}`);
    const wsBase = toWsBaseUrl(PUBLIC_BASE_URL);
    const streamQuery = new URLSearchParams();
    if (stage) {
      streamQuery.set("stage", stage);
    }
    if (brief) {
      streamQuery.set("brief", brief);
    }
    const streamUrl = `${wsBase}/twilio/media-stream${
      streamQuery.size > 0 ? `?${streamQuery.toString()}` : ""
    }`;

    const twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      "  <Connect>",
      `    <Stream url="${escapeXml(streamUrl)}">`,
      `      <Parameter name="callSid" value="${escapeXml(callSid)}" />`,
      stage ? `      <Parameter name="stage" value="${escapeXml(stage)}" />` : "",
      brief ? `      <Parameter name="brief" value="${escapeXml(brief)}" />` : "",
      "    </Stream>",
      "  </Connect>",
      "</Response>",
    ]
      .filter(Boolean)
      .join("\n");

    res.statusCode = 200;
    res.setHeader("content-type", "text/xml; charset=utf-8");
    res.end(twiml);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/twilio/outbound-call") {
    if (!PUBLIC_BASE_URL) {
      return jsonResponse(res, 500, {
        error: "Missing TELEPHONY_PUBLIC_BASE_URL for outbound call webhook URL.",
      });
    }
    const rawBody = await readBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const to = String(body.to || "").trim();
    const from = String(body.from || process.env.TWILIO_PHONE_NUMBER || "").trim();
    const stage = String(body.stage || "").trim();
    const brief = String(body.brief || "").trim();
    if (!to || !from) {
      return jsonResponse(res, 400, {
        error: "Both `to` and `from` phone numbers are required.",
      });
    }
    console.log(`[telephony-bridge] outbound-call requested -> stage="${stage}" to=${to}`);

    try {
      const webhookUrl = new URL(`${PUBLIC_BASE_URL.replace(/\/$/, "")}/twilio/voice`);
      if (stage) {
        webhookUrl.searchParams.set("stage", stage);
      }
      if (brief) {
        webhookUrl.searchParams.set("brief", brief.slice(0, 500));
      }
      const call = await createOutboundCall({
        to,
        from,
        webhookUrl: webhookUrl.toString(),
      });
      return jsonResponse(res, 200, {
        ok: true,
        sid: call.sid,
        status: call.status,
        to: call.to,
        from: call.from,
      });
    } catch (error) {
      return jsonResponse(res, 502, {
        error: error instanceof Error ? error.message : "Outbound call failed.",
      });
    }
  }

  jsonResponse(res, 404, { error: "Not found" });
});

const mediaWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const host = req.headers.host || `localhost:${BRIDGE_PORT}`;
  const requestUrl = new URL(req.url || "/", `http://${host}`);
  if (requestUrl.pathname !== "/twilio/media-stream") {
    socket.destroy();
    return;
  }
  mediaWss.handleUpgrade(req, socket, head, (ws) => {
    mediaWss.emit("connection", ws, req);
  });
});

mediaWss.on("connection", (twilioSocket, req) => {
  const streamId = randomUUID();
  const requestUrl = new URL(req.url || "/twilio/media-stream", "http://localhost");
  let stage = requestUrl.searchParams.get("stage") || "";
  let brief = requestUrl.searchParams.get("brief") || "";
  let streamSid = "";
  let callSid = "";
  let xaiSocket = null;
  let xaiReady = false;
  let sessionConfigured = false;
  let finalized = false;
  let agentTranscriptBuffer = "";
  const transcriptLines = [];
  const pendingAudioChunks = [];

  async function finalizeCall() {
    if (finalized) {
      return;
    }
    finalized = true;
    if (!callSid) {
      return;
    }

    const transcript = transcriptLines.join("\n").trim();
    // Only the insurance-verification and booking stages map to structured results we
    // surface in the UI. Other stages just retain the transcript.
    if (stage !== "insurance_verification" && stage !== "booking") {
      setCallResult(callSid, { stage, status: "ready", transcript });
      return;
    }

    if (!transcript) {
      setCallResult(callSid, {
        stage,
        status: "failed",
        transcript,
        error: "No transcript was captured from the live call.",
      });
      return;
    }

    setCallResult(callSid, { stage, status: "pending", transcript });
    try {
      if (stage === "booking") {
        const booking = await extractBookingResultFromTranscript(transcript);
        if (booking) {
          setCallResult(callSid, { stage, status: "ready", transcript, booking });
          console.log(`[telephony-bridge ${streamId}] extracted live booking for callSid=${callSid}`);
        } else {
          setCallResult(callSid, {
            stage,
            status: "failed",
            transcript,
            error: "Could not extract booking outcome from transcript.",
          });
        }
        return;
      }

      const result = await extractInsuranceResultFromTranscript(transcript);
      if (result) {
        setCallResult(callSid, { stage, status: "ready", transcript, result });
        console.log(`[telephony-bridge ${streamId}] extracted live coverage for callSid=${callSid}`);
      } else {
        setCallResult(callSid, {
          stage,
          status: "failed",
          transcript,
          error: "Could not extract structured coverage from transcript.",
        });
      }
    } catch (error) {
      setCallResult(callSid, {
        stage,
        status: "failed",
        transcript,
        error: error instanceof Error ? error.message : "Transcript extraction failed.",
      });
    }
  }

  function configureAndKickoff() {
    if (!xaiSocket || xaiSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    // Wait for both the model socket AND the Twilio start event, because
    // stage/brief are delivered via the start event's customParameters
    // (Twilio strips the query string from the media-stream WebSocket URL).
    if (!xaiReady || !streamSid || sessionConfigured) {
      return;
    }

    sessionConfigured = true;
    console.log(`[telephony-bridge ${streamId}] configuring session -> stage="${stage}"`);
    xaiSocket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: VOICE_NAME,
          instructions: [
            buildStageInstructions(stage, brief),
            (process.env.TELEPHONY_AGENT_INSTRUCTIONS || "").trim(),
          ]
            .filter(Boolean)
            .join(" "),
          turn_detection: { type: "server_vad" },
          audio: {
            input: {
              format: { type: "audio/pcmu" },
              // Transcribe the representative's speech so we can extract the real
              // coverage answers from the call (best-effort; ignored if unsupported).
              transcription: { model: "whisper-1" },
            },
            output: { format: { type: "audio/pcmu" } },
          },
        },
      })
    );
    xaiSocket.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildKickoffPrompt(stage),
            },
          ],
        },
      })
    );
    xaiSocket.send(
      JSON.stringify({
        type: "response.create",
        response: { modalities: ["audio", "text"] },
      })
    );
  }

  try {
    requireEnv("XAI_API_KEY", XAI_API_KEY);
  } catch (error) {
    console.error(`[telephony-bridge ${streamId}]`, error.message);
    twilioSocket.close();
    return;
  }

  xaiSocket = new WebSocket(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(XAI_MODEL)}`, {
    headers: { Authorization: `Bearer ${XAI_API_KEY}` },
  });

  xaiSocket.on("open", () => {
    xaiReady = true;
    configureAndKickoff();
  });

  xaiSocket.on("message", (raw) => {
    if (twilioSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    let event = null;
    try {
      event = JSON.parse(String(raw));
    } catch {
      return;
    }

    const eventType = event?.type || "";

    // Capture both sides of the conversation for transcript-based extraction.
    // Agent speech: response.(output_)audio_transcript.delta/.done
    // Representative speech: conversation.item.input_audio_transcription.completed
    if (eventType.includes("transcript")) {
      const isRepresentative = eventType.includes("input_audio_transcription");
      if (!isRepresentative && typeof event?.delta === "string" && event.delta) {
        agentTranscriptBuffer += event.delta;
      }
      if (eventType.endsWith(".done") || eventType.endsWith(".completed")) {
        const full =
          typeof event?.transcript === "string" && event.transcript.trim()
            ? event.transcript.trim()
            : agentTranscriptBuffer.trim();
        if (full) {
          transcriptLines.push(`${isRepresentative ? "Representative" : "Agent"}: ${full}`);
        }
        if (!isRepresentative) {
          agentTranscriptBuffer = "";
        }
      }
    }

    if (!streamSid) {
      return;
    }

    if (eventType === "response.output_audio.delta" || eventType === "response.audio.delta") {
      const payload = event?.delta;
      if (typeof payload === "string" && payload.length > 0) {
        if (!streamSid) {
          pendingAudioChunks.push(payload);
          return;
        }
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload },
          })
        );
      }
      return;
    }

    if (eventType === "error") {
      console.error(`[telephony-bridge ${streamId}] xAI error`, event?.error || event);
    }
  });

  xaiSocket.on("error", (err) => {
    console.error(`[telephony-bridge ${streamId}] xAI websocket error:`, err.message);
  });

  xaiSocket.on("close", () => {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.close();
    }
  });

  twilioSocket.on("message", (raw) => {
    let event = null;
    try {
      event = JSON.parse(String(raw));
    } catch {
      return;
    }
    const eventType = event?.event || "";

    if (eventType === "start") {
      streamSid = event?.start?.streamSid || "";
      const customParameters = event?.start?.customParameters || {};
      if (customParameters.stage) {
        stage = String(customParameters.stage);
      }
      if (customParameters.brief) {
        brief = String(customParameters.brief);
      }
      if (customParameters.callSid) {
        callSid = String(customParameters.callSid);
        // Mark the call as in-progress so pollers receive "pending" (not "not_found").
        setCallResult(callSid, { stage, status: "pending" });
      }
      console.log(
        `[telephony-bridge ${streamId}] stream started ${streamSid} -> stage="${stage}" callSid=${callSid}`
      );
      while (pendingAudioChunks.length > 0 && twilioSocket.readyState === WebSocket.OPEN) {
        const payload = pendingAudioChunks.shift();
        twilioSocket.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload },
          })
        );
      }
      configureAndKickoff();
      return;
    }

    if (eventType === "media") {
      if (xaiSocket.readyState !== WebSocket.OPEN) {
        return;
      }
      const payload = event?.media?.payload;
      if (typeof payload === "string" && payload.length > 0) {
        xaiSocket.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: payload,
          })
        );
      }
      return;
    }

    if (eventType === "stop") {
      void finalizeCall();
      if (xaiSocket.readyState === WebSocket.OPEN) {
        xaiSocket.close();
      }
      twilioSocket.close();
    }
  });

  twilioSocket.on("close", () => {
    void finalizeCall();
    if (xaiSocket && xaiSocket.readyState === WebSocket.OPEN) {
      xaiSocket.close();
    }
    console.log(`[telephony-bridge ${streamId}] stream closed`);
  });

  twilioSocket.on("error", (err) => {
    console.error(`[telephony-bridge ${streamId}] twilio websocket error:`, err.message);
    if (xaiSocket && xaiSocket.readyState === WebSocket.OPEN) {
      xaiSocket.close();
    }
  });
});

server.listen(BRIDGE_PORT, () => {
  console.log(`[telephony-bridge] listening on http://localhost:${BRIDGE_PORT}`);
  console.log(`[telephony-bridge] model: ${XAI_MODEL}`);
  console.log("[telephony-bridge] endpoints:");
  console.log("  POST /twilio/voice");
  console.log("  POST /twilio/outbound-call");
  console.log("  GET  /twilio/call-result");
  console.log("  GET  /health");
});
