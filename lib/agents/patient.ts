// PATIENT AGENT — the product. Orchestrates the agent-to-agent negotiation on
// the patient's behalf and returns the full A2A message log for the visualizer.
//
// Each labeled section below is one durable STEP. To wire Inngest (sponsor
// track), wrap each section in `step.run("name", () => ...)` inside an Inngest
// function — the structure is already step-shaped. See lib/inngest.example.ts.

import {
  A2AMessage,
  AgentId,
  A2AIntent,
  IntakeRecord,
  NegotiationResult,
} from "../a2a/types";
import { payerInitialResponse, payerAfterDispute } from "./payer";
import { clinicInitialOffer, clinicAfterCounter } from "./clinic";
import { chat } from "../llm";

export async function runNegotiation(
  intake: IntakeRecord
): Promise<NegotiationResult> {
  const messages: A2AMessage[] = [];
  let i = 0;
  const push = (
    from: AgentId,
    to: AgentId,
    intent: A2AIntent,
    text: string,
    data?: Record<string, unknown>
  ) => {
    i += 1;
    messages.push({ id: `m${i}`, from, to, intent, text, data, ts: i });
  };

  // ── STEP: negotiate coverage (patient agent ⇄ payer agent) ──────────────
  push(
    "patient",
    "payer",
    "coverage.request",
    `Requesting coverage for ${intake.category} care on behalf of my patient: "${intake.chiefComplaint}".`,
    { intake }
  );

  const initial = payerInitialResponse(intake);
  push("payer", "patient", "coverage.offer", initial.text, {
    result: initial.result,
  });

  const disputeText = await voicePatientDispute(intake);
  push("patient", "payer", "coverage.dispute", disputeText);

  const settled = payerAfterDispute(intake);
  push("payer", "patient", "coverage.settle", settled.text, {
    result: settled.result,
  });
  const coverage = settled.result;

  // ── STEP: negotiate scheduling (patient agent ⇄ clinic agent) ───────────
  push(
    "patient",
    "clinic",
    "schedule.request",
    "Need the earliest in-network appointment. Telehealth acceptable. Patient is in distress — please prioritize."
  );

  const offer = clinicInitialOffer();
  push("clinic", "patient", "schedule.offer", offer.text, {
    appointment: offer.appointment,
  });

  push(
    "patient",
    "clinic",
    "schedule.counter",
    "Three weeks is too long given the distress reported. Requesting the cancellation list and any telehealth openings this week."
  );

  const counter = clinicAfterCounter();
  push("clinic", "patient", "schedule.offer", counter.text, {
    appointment: counter.appointment,
  });

  return { messages, coverage, appointment: counter.appointment };
}

// The patient agent's persuasive line — LLM-voiced via Grok when a key is set,
// deterministic otherwise. The negotiation OUTCOME never depends on the LLM.
async function voicePatientDispute(intake: IntakeRecord): Promise<string> {
  const fallback =
    "On my patient's behalf: federal mental-health parity law (MHPAEA) requires behavioral health to be covered comparably to medical care. Please waive the referral and quote the in-network copay.";

  const llm = await chat({
    system:
      "You are a patient's advocate agent negotiating against an insurer's agent. Be concise and firm, cite mental-health parity law (MHPAEA), and demand comparable coverage. One or two sentences, no preamble.",
    prompt: `The insurer's agent claims behavioral health needs a referral and may be out-of-network. Push back on the patient's behalf for this complaint: "${intake.chiefComplaint}".`,
    temperature: 0.6,
  });

  return llm?.trim() || fallback;
}
