import { NextResponse } from "next/server";
import { askCompanion } from "@/lib/companion";

export async function POST(req: Request) {
  const { question } = await req.json().catch(() => ({ question: "" }));
  if (!question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const answer = await askCompanion(question);
  return NextResponse.json(answer);
}
