// Canned visit transcript + care plan for Maya's session with Dr. Chen.
// In the real product this is produced by the Scribe agent from visit audio.
// For the demo it is pre-loaded and OWNED BY THE PATIENT (the thesis: her data,
// not the clinic's). The Companion agent retrieves strictly from these chunks.

export interface Chunk {
  source: string;
  text: string;
}

export const TRANSCRIPT_CHUNKS: Chunk[] = [
  {
    source: "Session 1 · breathing technique",
    text: "When a panic attack starts at night, use the 4-7-8 breathing exercise: inhale for 4 seconds, hold for 7, exhale for 8, and repeat four cycles. Dr. Chen recommended this as the first thing to try in the moment.",
  },
  {
    source: "Session 1 · medication",
    text: "Dr. Chen started a low dose of an SSRI (sertraline 25mg), taken in the morning. It can take 2-4 weeks for the full effect, and mild nausea in the first week is common and expected.",
  },
  {
    source: "Session 1 · triggers",
    text: "We identified that the panic episodes cluster around work deadlines and late-night caffeine. The plan is no caffeine after 2pm and a consistent wind-down routine before bed.",
  },
  {
    source: "Session 1 · follow-up",
    text: "Follow-up is in two weeks by telehealth to see how the medication and breathing techniques are working. Message the office sooner if symptoms get worse.",
  },
];

// Naive crisis lexicon used by the Companion agent to trigger 988 escalation.
export const CRISIS_TERMS = [
  "suicid",
  "kill myself",
  "want to die",
  "end it all",
  "hurt myself",
  "self-harm",
  "no reason to live",
];

export const CARE_PLAN = {
  diagnosis: "Panic disorder (provisional)",
  medications: ["Sertraline 25mg — mornings"],
  techniques: [
    "4-7-8 breathing for acute episodes",
    "No caffeine after 2pm",
    "Wind-down routine before bed",
  ],
  followUp: "2 weeks — telehealth with Dr. Chen",
};
