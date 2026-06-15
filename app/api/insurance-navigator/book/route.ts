import { NextResponse } from "next/server";
import { runInsuranceNavigatorBooking } from "@/features/insurance-navigator/orchestrator/runInsuranceNavigatorBooking";

export const runtime = "nodejs";
export const maxDuration = 60;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await runInsuranceNavigatorBooking(body);
  if (!result.ok) {
    return NextResponse.json(result.error, { status: 400, headers: JSON_HEADERS });
  }

  return NextResponse.json(result.data, { headers: JSON_HEADERS });
}
