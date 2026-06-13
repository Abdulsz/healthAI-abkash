// The agent-to-agent (A2A) protocol contract.
// This is the KEY interface of the whole product: the patient's agent and the
// institutional agents (payer, clinic) speak only through A2AMessages.
// Shape is intentionally MCP / Google-A2A flavored (typed intents + payload).

export type AgentId = "patient" | "payer" | "clinic";

export type A2AIntent =
  | "coverage.request"
  | "coverage.offer"
  | "coverage.dispute"
  | "coverage.settle"
  | "schedule.request"
  | "schedule.offer"
  | "schedule.counter"
  | "schedule.confirm";

export interface A2AMessage {
  id: string;
  from: AgentId;
  to: AgentId;
  intent: A2AIntent;
  /** Human-readable line rendered in the negotiation visualizer. */
  text: string;
  /** Structured payload (coverage result, appointment, etc.). */
  data?: Record<string, unknown>;
  /** Monotonic ordering index within a single negotiation. */
  ts: number;
}

export interface IntakeRecord {
  chiefComplaint: string;
  symptoms: string[];
  severity: "low" | "moderate" | "high" | "crisis";
  category: string; // e.g. "behavioral-health"
  raw: string;
}

export interface CoverageResult {
  status: "covered" | "not_covered" | "uncertain";
  copay: number | null;
  requiresReferral: boolean;
  rationale: string;
  parityInvoked: boolean;
}

export interface Appointment {
  provider: string;
  modality: "in-person" | "telehealth";
  datetime: string;
  confirmationId: string | null;
  status: "proposed" | "booked";
}

export interface NegotiationResult {
  messages: A2AMessage[];
  coverage: CoverageResult;
  appointment: Appointment;
}
