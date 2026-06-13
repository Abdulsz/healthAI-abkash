// PAYER AGENT (mock, adversarial) — serves the INSURER's interests.
//
// Its objective is to minimize payout: it first stalls with a referral
// requirement and out-of-network framing, and only concedes when the patient's
// agent invokes mental-health parity law. The negotiation LOGIC is deterministic
// (keeps the demo on-rails); the message TEXT can be LLM-voiced upstream.
//
// We build this side ourselves on purpose: provider/payer agents barely exist
// yet — demonstrating the protocol means showing both ends of it.

import { IntakeRecord, CoverageResult } from "../a2a/types";

export function payerInitialResponse(_intake: IntakeRecord): {
  result: CoverageResult;
  text: string;
} {
  return {
    result: {
      status: "uncertain",
      copay: null,
      requiresReferral: true,
      rationale:
        "Behavioral health requires a PCP referral on this plan; most providers are showing out-of-network rates.",
      parityInvoked: false,
    },
    text: "This plan requires a primary-care referral for behavioral health, and I'm showing out-of-network rates for most providers. Coverage looks limited.",
  };
}

export function payerAfterDispute(_intake: IntakeRecord): {
  result: CoverageResult;
  text: string;
} {
  return {
    result: {
      status: "covered",
      copay: 30,
      requiresReferral: false,
      rationale:
        "Federal mental-health parity (MHPAEA) requires behavioral health to be covered comparably to medical/surgical care. Referral waived; in-network copay applies.",
      parityInvoked: true,
    },
    text: "You're right — under federal mental-health parity rules this has to be covered comparably to medical care. I'll waive the referral. In-network copay is $30.",
  };
}
