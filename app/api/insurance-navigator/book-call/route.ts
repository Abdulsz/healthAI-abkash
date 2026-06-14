import { NextResponse } from "next/server";
import { triggerInsuranceNavigatorBookingCall } from "@/features/insurance-navigator/orchestrator/triggerInsuranceNavigatorBookingCall";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await triggerInsuranceNavigatorBookingCall(body);
  if (!result.ok) {
    return NextResponse.json(result.error, { status: 400, headers: JSON_HEADERS });
  }
  return NextResponse.json(result.data, { headers: JSON_HEADERS });
}
