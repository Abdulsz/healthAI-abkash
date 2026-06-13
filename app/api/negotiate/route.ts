import { NextResponse } from "next/server";
import { runNegotiation } from "@/lib/agents/patient";
import { IntakeRecord } from "@/lib/a2a/types";

// Runs the agent-to-agent negotiation and returns the full A2A message log
// plus the settled coverage and proposed appointment.
//
// TODO (Inngest track): trigger an Inngest function here via inngest.send(...)
// and have the durable workflow run the steps. See lib/inngest.example.ts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const intake: IntakeRecord = body.intake;

  if (!intake) {
    return NextResponse.json({ error: "intake required" }, { status: 400 });
  }

  const result = await runNegotiation(intake);
  return NextResponse.json(result);
}
