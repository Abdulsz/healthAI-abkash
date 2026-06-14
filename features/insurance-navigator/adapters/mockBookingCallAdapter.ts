import {
  InsuranceNavigatorBookingRequest,
  InsuranceNavigatorBookingResponse,
} from "../domain/contracts";
import { BookingCallAdapter } from "./bookingCallAdapter";

function bookingCode(value: string): string {
  const raw = Array.from(value).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  return raw.toString(36).slice(0, 8).toUpperCase();
}

export class MockBookingCallAdapter implements BookingCallAdapter {
  getAdapterName(): string {
    return "mock";
  }

  async bookAppointment(
    input: InsuranceNavigatorBookingRequest
  ): Promise<InsuranceNavigatorBookingResponse> {
    const selectedSlot = input.preferred_dates[0] || "Next available appointment";
    return {
      confirmation_id: `INS-${bookingCode(`${input.provider_id}:${selectedSlot}`)}`,
      provider_name: input.provider_name,
      scheduled_for: selectedSlot,
      status: "booked",
      booking_phone: input.provider_phone,
    };
  }
}
