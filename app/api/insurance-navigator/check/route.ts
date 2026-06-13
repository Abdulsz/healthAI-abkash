import { NextResponse } from "next/server";
import { runInsuranceCheck } from "../../../../features/insurance-navigator/orchestrator/runInsuranceCheck";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await runInsuranceCheck(body);

  if (!result.ok) {
    return NextResponse.json(result.error, { status: 400 });
  }

  return NextResponse.json(result.data);
}
