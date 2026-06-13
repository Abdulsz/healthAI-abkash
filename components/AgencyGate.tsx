"use client";

import { CoverageResult, Appointment } from "@/lib/a2a/types";

// The AGENCY GATE — the agent did the labor, but the PATIENT makes the decision.
// This is how "fully autonomous" and "patient agency" coexist. Say it on stage.

export default function AgencyGate({
  coverage,
  appointment,
  onBook,
}: {
  coverage: CoverageResult;
  appointment: Appointment;
  onBook: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid #6ee7a8",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 13, color: "#6ee7a8", marginBottom: 10 }}>
        ✓ Your agent negotiated this for you — your call
      </div>

      <Row k="Coverage">
        {coverage.status === "covered" ? "Covered" : coverage.status}
        {coverage.copay != null && ` · $${coverage.copay} copay`}
        {coverage.parityInvoked && (
          <span style={{ color: "#f5c451" }}> · parity enforced</span>
        )}
      </Row>
      <Row k="Provider">{appointment.provider}</Row>
      <Row k="When">{appointment.datetime}</Row>
      <Row k="How">{appointment.modality}</Row>

      <div style={{ fontSize: 13, color: "#a0a0b8", margin: "12px 0 16px" }}>
        {coverage.rationale}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onBook}
          style={{
            background: "#6ee7a8",
            color: "#06210f",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Book it
        </button>
        <button
          style={{
            background: "transparent",
            color: "#a0a0b8",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          See other options
        </button>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 15 }}>
      <span style={{ width: 90, color: "#8a8aa0" }}>{k}</span>
      <span>{children}</span>
    </div>
  );
}
