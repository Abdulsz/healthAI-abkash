import { NextResponse } from "next/server";
import {
  TELEPHONY_BRIDGE_INTERNAL_URL_DEFAULT,
  TELEPHONY_BRIDGE_INTERNAL_URL_ENV_KEY,
} from "@/features/insurance-navigator/config/constants";
import { LiveCallResultResponse } from "@/features/insurance-navigator/domain/contracts";

export const runtime = "nodejs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const callSid = (url.searchParams.get("call_sid") || "").trim();

  if (!callSid) {
    const body: LiveCallResultResponse = {
      call_sid: "",
      stage: "",
      status: "not_found",
      error: "call_sid query parameter is required.",
    };
    return NextResponse.json(body, { status: 400, headers: JSON_HEADERS });
  }

  const bridgeBaseUrl = (
    process.env[TELEPHONY_BRIDGE_INTERNAL_URL_ENV_KEY] || TELEPHONY_BRIDGE_INTERNAL_URL_DEFAULT
  )
    .trim()
    .replace(/\/$/, "");

  try {
    const response = await fetch(
      `${bridgeBaseUrl}/twilio/call-result?callSid=${encodeURIComponent(callSid)}`,
      { cache: "no-store" }
    );
    const payload = (await response.json().catch(() => ({}))) as Partial<LiveCallResultResponse>;
    const body: LiveCallResultResponse = {
      call_sid: callSid,
      stage: payload.stage || "",
      status: payload.status || "pending",
      result: payload.result,
      booking: payload.booking,
      transcript: payload.transcript,
      error: payload.error,
    };
    return NextResponse.json(body, {
      status: response.ok ? 200 : response.status,
      headers: JSON_HEADERS,
    });
  } catch {
    // Bridge unreachable (e.g. cold start). Report pending so the client keeps polling
    // up to its capped attempt budget instead of surfacing a hard error.
    const body: LiveCallResultResponse = {
      call_sid: callSid,
      stage: "",
      status: "pending",
    };
    return NextResponse.json(body, { status: 200, headers: JSON_HEADERS });
  }
}
