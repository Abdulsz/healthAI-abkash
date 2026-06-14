import {
  InsuranceNavigatorBookingRequest,
  InsuranceNavigatorBookingResponse,
} from "../domain/contracts";
import { runGrokVoiceJsonTurn, runGrokVoiceTextTurn } from "./grokVoiceSession";
import { BookingCallAdapter } from "./bookingCallAdapter";

function fallbackConfirmation(input: InsuranceNavigatorBookingRequest): string {
  const hash = Array.from(`${input.provider_id}:${input.preferred_dates[0] || ""}`).reduce(
    (acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0,
    11
  );
  return `INS-${hash.toString(36).slice(0, 8).toUpperCase()}`;
}

export class GrokBookingCallAdapter implements BookingCallAdapter {
  getAdapterName(): string {
    return "grok";
  }

  async bookAppointment(
    input: InsuranceNavigatorBookingRequest
  ): Promise<InsuranceNavigatorBookingResponse> {
    const prompt = [
      `Provider: ${input.provider_name}`,
      `Provider phone: ${input.provider_phone}`,
      `Procedure: ${input.procedure_name}`,
      `Plan: ${input.plan_name}`,
      `Member ID: ${input.member_id}`,
      `Group number: ${input.group_number}`,
      `Preferred dates: ${input.preferred_dates.join(", ")}`,
      'Return JSON schema: {"confirmation_id":string,"scheduled_for":string}',
    ].join("\n");

    let confirmationId = "";
    let scheduledFor = "";

    try {
      const response = await runGrokVoiceJsonTurn<{
        confirmation_id?: string;
        scheduled_for?: string;
      }>({
        instructions: [
          "You are a scheduling voice agent.",
          "Simulate calling the provider and scheduling the requested procedure.",
          "Return valid JSON only.",
        ].join(" "),
        prompt,
      });
      confirmationId = typeof response.confirmation_id === "string" ? response.confirmation_id : "";
      scheduledFor = typeof response.scheduled_for === "string" ? response.scheduled_for : "";
    } catch {
      const fallbackText = await runGrokVoiceTextTurn({
        instructions: [
          "You are a scheduling voice agent.",
          "Output plain lines only:",
          "confirmation_id: INS-ABC123",
          "scheduled_for: Thu 4:00 PM",
        ].join(" "),
        prompt,
      });
      const confirmationMatch = fallbackText.match(
        /(?:confirmation[_\s]?id)\s*[:=-]\s*([A-Za-z0-9\-_]+)/i
      );
      const scheduledMatch = fallbackText.match(/(?:scheduled[_\s]?for)\s*[:=-]\s*([^\n]+)/i);
      confirmationId = confirmationMatch?.[1] || "";
      scheduledFor = scheduledMatch?.[1]?.trim() || "";
    }

    return {
      confirmation_id: confirmationId.trim() || fallbackConfirmation(input),
      provider_name: input.provider_name,
      scheduled_for: scheduledFor || input.preferred_dates[0] || "Next available appointment",
      status: "booked",
      booking_phone: input.provider_phone,
    };
  }
}
