import { NextResponse } from "next/server";
import { IntakeRecord } from "@/lib/a2a/types";
import { CRISIS_TERMS } from "@/lib/data/transcript";

// Intake / triage. In the real product this is a voice agent (Vapi/Retell → Grok)
// doing structured extraction. For the demo we accept text and return a
// structured IntakeRecord, with a rule-first crisis check.
export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({ text: "" }));
  const t = (text || "").toLowerCase();
  const crisis = CRISIS_TERMS.some((w: string) => t.includes(w));

  const intake: IntakeRecord = {
    chiefComplaint: text?.trim() || "Recurring panic attacks, especially at night",
    symptoms: ["panic attacks", "racing heart", "trouble sleeping"],
    severity: crisis ? "crisis" : "moderate",
    category: "behavioral-health",
    raw: text || "",
  };

  return NextResponse.json({ intake });
}
