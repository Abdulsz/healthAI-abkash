import {
  TELEPHONY_BRIDGE_INTERNAL_URL_DEFAULT,
  TELEPHONY_BRIDGE_INTERNAL_URL_ENV_KEY,
} from "../config/constants";

type TriggerOutboundCallInput = {
  to: string;
  stage?: "insurance_verification" | "provider_pricing" | "booking";
  brief?: string;
};

export type TriggerOutboundCallResult =
  | { ok: true; sid?: string }
  | { ok: false; error: string };

export async function triggerOutboundCall(
  input: TriggerOutboundCallInput
): Promise<TriggerOutboundCallResult> {
  const bridgeBaseUrl = (
    process.env[TELEPHONY_BRIDGE_INTERNAL_URL_ENV_KEY] || TELEPHONY_BRIDGE_INTERNAL_URL_DEFAULT
  )
    .trim()
    .replace(/\/$/, "");

  try {
    const response = await fetch(`${bridgeBaseUrl}/twilio/outbound-call`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        to: input.to,
        stage: input.stage,
        brief: input.brief,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      sid?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: payload.error || "Outbound call request failed.",
      };
    }

    return {
      ok: true,
      sid: payload.sid,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error while triggering outbound call.",
    };
  }
}
