// CLINIC AGENT (mock, adversarial) — serves the CLINIC's interests.
//
// Its objective is to protect the schedule: it first offers a far-out in-person
// slot, and only surfaces a near-term telehealth opening when the patient's
// agent counters (cancellation list + telehealth, citing distress).

import { Appointment } from "../a2a/types";

export function clinicInitialOffer(): { appointment: Appointment; text: string } {
  return {
    appointment: {
      provider: "Dr. Chen",
      modality: "in-person",
      datetime: "~3 weeks out (Mon, in-person)",
      confirmationId: null,
      status: "proposed",
    },
    text: "The earliest in-person opening with Dr. Chen is about 3 weeks out.",
  };
}

export function clinicAfterCounter(): { appointment: Appointment; text: string } {
  return {
    appointment: {
      provider: "Dr. Chen",
      modality: "telehealth",
      datetime: "Thursday 4:00 PM (telehealth)",
      confirmationId: null,
      status: "proposed",
    },
    text: "Checking the cancellation list and telehealth slots… I can offer Thursday 4:00 PM by video.",
  };
}
