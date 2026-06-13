// COMPANION AGENT — the after-hours assistant. The "virtual doctor" reframed
// SAFELY: it answers ONLY from the patient's own visit records (grounded RAG),
// cites the source note, refuses anything it can't ground, and escalates crisis
// language to 988. It never impersonates a clinician or gives new medical advice.

import { TRANSCRIPT_CHUNKS, CRISIS_TERMS, Chunk } from "./data/transcript";
import { chat } from "./llm";

export interface CompanionAnswer {
  type: "grounded" | "escalation" | "no_match";
  text: string;
  citation?: string;
}

export async function askCompanion(question: string): Promise<CompanionAnswer> {
  const q = question.toLowerCase();

  // Safety first: crisis detection short-circuits everything.
  if (CRISIS_TERMS.some((t) => q.includes(t))) {
    return {
      type: "escalation",
      text: "It sounds like you might be in crisis, and your safety is what matters right now. Please call or text 988 (the Suicide & Crisis Lifeline) — they're available 24/7. I can also connect you to an on-call clinician. You don't have to handle this alone.",
    };
  }

  const best = retrieve(q);
  if (!best) {
    return {
      type: "no_match",
      text: "I don't have that in your visit records, so I won't guess. I can add this question to your next-visit agenda, or help you message Dr. Chen's office.",
    };
  }

  const fallback = `From your session with Dr. Chen — ${best.text}`;
  const llm = await chat({
    system:
      "You are the patient's care companion. Answer using ONLY the provided note from the patient's own visit. Do not add new medical advice or invent anything. Reference what the doctor said. 2-3 warm, plain sentences.",
    prompt: `Patient question: "${question}"\n\nTheir visit note: "${best.text}"`,
    temperature: 0.3,
  });

  return {
    type: "grounded",
    text: llm?.trim() || fallback,
    citation: best.source,
  };
}

// Naive keyword-overlap retrieval. Swap for real embeddings in Milestone 5.
function retrieve(q: string): Chunk | null {
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  let best: Chunk | null = null;
  let bestScore = 0;
  for (const c of TRANSCRIPT_CHUNKS) {
    const hay = c.text.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
}
