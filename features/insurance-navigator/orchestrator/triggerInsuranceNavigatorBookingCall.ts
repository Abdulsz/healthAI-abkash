import { triggerOutboundCall } from "../adapters/telephonyBridgeClient";

type TriggerValidationError = {
  error: "validation_error";
  issues: Array<{ field: string; message: string }>;
};

export type TriggerBookingCallResponse = {
  stage: "booking";
  requested: boolean;
  status: "triggered" | "failed";
  call_sid?: string;
  error?: string;
  scheduled_for?: string;
  confirmation_id?: string;
};

type TriggerResult =
  | { ok: true; data: TriggerBookingCallResponse }
  | { ok: false; error: TriggerValidationError };

export async function triggerInsuranceNavigatorBookingCall(
  body: unknown
): Promise<TriggerResult> {
  const value = body as Record<string, unknown>;
  const callbackPhone =
    typeof value?.callback_phone === "string" ? value.callback_phone.trim() : "";
  const providerName =
    typeof value?.provider_name === "string" ? value.provider_name.trim() : "selected provider";
  const procedureName =
    typeof value?.procedure_name === "string" ? value.procedure_name.trim() : "requested procedure";
  const preferredDateTime =
    typeof value?.preferred_datetime === "string" ? value.preferred_datetime.trim() : "";
  const planName = typeof value?.plan_name === "string" ? value.plan_name.trim() : "";
  const memberId = typeof value?.member_id === "string" ? value.member_id.trim() : "";
  const scheduledFor = typeof value?.scheduled_for === "string" ? value.scheduled_for.trim() : "";
  const confirmationId =
    typeof value?.confirmation_id === "string" ? value.confirmation_id.trim() : "";

  const issues: Array<{ field: string; message: string }> = [];
  if (!callbackPhone) {
    issues.push({ field: "callback_phone", message: "field is required" });
  } else if (!/^\+?[1-9]\d{9,14}$/.test(callbackPhone)) {
    issues.push({
      field: "callback_phone",
      message: "must be a valid E.164 phone (example: +12298293537)",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: { error: "validation_error", issues },
    };
  }

  const outbound = await triggerOutboundCall({
    to: callbackPhone,
    stage: "booking",
    brief: [
      `Provider name: ${providerName}.`,
      `Procedure: ${procedureName}.`,
      preferredDateTime ? `Preferred date/time: ${preferredDateTime}.` : "",
      planName ? `Plan name: ${planName}.` : "",
      memberId ? `Member ID: ${memberId}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  });

  if (outbound.ok) {
    return {
      ok: true,
      data: {
        stage: "booking",
        requested: true,
        status: "triggered",
        call_sid: outbound.sid,
        scheduled_for: scheduledFor || undefined,
        confirmation_id: confirmationId || undefined,
      },
    };
  }

  return {
    ok: true,
    data: {
      stage: "booking",
      requested: true,
      status: "failed",
      error: outbound.error,
    },
  };
}
