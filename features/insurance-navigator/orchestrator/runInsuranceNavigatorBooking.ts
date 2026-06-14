import {
  InsuranceNavigatorBookingRequest,
  InsuranceNavigatorBookingResponse,
} from "../domain/contracts";
import { MockBookingCallAdapter } from "../adapters/mockBookingCallAdapter";
import { BookingCallAdapter } from "../adapters/bookingCallAdapter";
import {
  BOOKING_ADAPTER_ENV_KEY,
  DEFAULT_BOOKING_ADAPTER,
} from "../config/constants";
import { GrokBookingCallAdapter } from "../adapters/grokBookingCallAdapter";

type BookingValidationError = {
  error: "validation_error";
  issues: Array<{ field: string; message: string }>;
};

type BookingResult =
  | { ok: true; data: InsuranceNavigatorBookingResponse }
  | { ok: false; error: BookingValidationError };

function validateBookingInput(body: unknown): {
  ok: true;
  data: InsuranceNavigatorBookingRequest;
} | { ok: false; error: BookingValidationError } {
  const value = body as Record<string, unknown>;
  const requiredStringFields: Array<keyof InsuranceNavigatorBookingRequest> = [
    "provider_id",
    "provider_name",
    "provider_phone",
    "procedure_name",
    "plan_name",
    "member_id",
    "group_number",
  ];

  const issues: Array<{ field: string; message: string }> = [];
  for (const field of requiredStringFields) {
    const current = value?.[field];
    if (typeof current !== "string" || current.trim().length === 0) {
      issues.push({ field, message: "field is required" });
    }
  }

  const preferredDates = Array.isArray(value?.preferred_dates)
    ? value.preferred_dates.filter((item): item is string => typeof item === "string")
    : [];

  if (preferredDates.length === 0) {
    issues.push({
      field: "preferred_dates",
      message: "choose at least one preferred date option",
    });
  }

  const callbackPhone =
    typeof value.callback_phone === "string" ? value.callback_phone.trim() : "";
  if (callbackPhone && !/^\+?[1-9]\d{9,14}$/.test(callbackPhone)) {
    issues.push({
      field: "callback_phone",
      message: "must be a valid E.164 phone (example: +12298293537)",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        error: "validation_error",
        issues,
      },
    };
  }

  return {
    ok: true,
    data: {
      provider_id: String(value.provider_id).trim(),
      provider_name: String(value.provider_name).trim(),
      provider_phone: String(value.provider_phone).trim(),
      procedure_name: String(value.procedure_name).trim(),
      plan_name: String(value.plan_name).trim(),
      member_id: String(value.member_id).trim(),
      group_number: String(value.group_number).trim(),
      preferred_dates: preferredDates,
      callback_phone: callbackPhone || undefined,
    },
  };
}

function buildBookingCallAdapter(): BookingCallAdapter {
  const configured = (process.env[BOOKING_ADAPTER_ENV_KEY] || DEFAULT_BOOKING_ADAPTER)
    .trim()
    .toLowerCase();
  if (configured === "grok") {
    return new GrokBookingCallAdapter();
  }
  return new MockBookingCallAdapter();
}

export async function runInsuranceNavigatorBooking(body: unknown): Promise<BookingResult> {
  const validated = validateBookingInput(body);
  if (!validated.ok) {
    return validated;
  }

  const adapter = buildBookingCallAdapter();
  const result = await adapter.bookAppointment(validated.data);

  return {
    ok: true,
    data: result,
  };
}
