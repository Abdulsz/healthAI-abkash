import {
  InsuranceNavigatorBookingRequest,
  InsuranceNavigatorBookingResponse,
} from "../domain/contracts";

export interface BookingCallAdapter {
  getAdapterName(): string;
  bookAppointment(
    input: InsuranceNavigatorBookingRequest
  ): Promise<InsuranceNavigatorBookingResponse>;
}
