"use client";

import { useState } from "react";
import Link from "next/link";
import { IntakeRecord, NegotiationResult } from "@/lib/a2a/types";
import { CARE_PLAN } from "@/lib/data/transcript";
import NegotiationTheater from "@/components/NegotiationTheater";
import AgencyGate from "@/components/AgencyGate";
import CompanionChat from "@/components/CompanionChat";

type Stage = "intake" | "negotiating" | "gate" | "booked";

export default function Home() {
  const [stage, setStage] = useState<Stage>("intake");
  const [text, setText] = useState(
    "I've been having panic attacks at night and I can't sleep. I just moved here and I don't know if my insurance covers this."
  );
  const [intake, setIntake] = useState<IntakeRecord | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationResult | null>(null);
  const [crisis, setCrisis] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startIntake() {
    setLoading(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const { intake } = await res.json();
      setIntake(intake);
      if (intake.severity === "crisis") {
        setCrisis(true);
        return;
      }
      const neg = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake }),
      });
      setNegotiation(await neg.json());
      setStage("negotiating");
    } finally {
      setLoading(false);
    }
  }

  function book() {
    setConfirmation("LGN-" + Math.abs(hash(text)).toString(36).slice(0, 6).toUpperCase());
    setStage("booked");
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 20px 80px" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>
          The Patient&apos;s Agent
        </h1>
        <p style={{ color: "#8a8aa0", marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
          Everyone at the table already has an agent — the hospital, the clinic, the
          insurer. Everyone except the patient. This is theirs.
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/insurance-navigator" style={{ color: "#93c5fd", fontSize: 14 }}>
            Open Insurance Navigator MVP →
          </Link>
        </div>
      </header>

      {/* Stage 1 — Intake */}
      <Section title="1 · Tell your agent what's wrong">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={textareaStyle}
        />
        <button onClick={startIntake} disabled={loading || stage !== "intake"} style={primaryBtn}>
          {loading ? "Your agent is working…" : "Talk to my agent"}
        </button>
        {crisis && (
          <div style={crisisBox}>
            ⚠️ Your agent detected a possible crisis. Please call or text <b>988</b> (Suicide
            &amp; Crisis Lifeline) now. Connecting you to an on-call clinician — booking is
            paused until you&apos;re safe.
          </div>
        )}
        {intake && !crisis && (
          <div style={{ fontSize: 13, color: "#6ee7a8", marginTop: 10 }}>
            ✓ Understood: {intake.chiefComplaint} — flagged as {intake.category}, {intake.severity}.
          </div>
        )}
      </Section>

      {/* Stage 2 — A2A negotiation */}
      {negotiation && (stage === "negotiating" || stage === "gate" || stage === "booked") && (
        <Section title="2 · Your agent negotiates — agent to agent">
          <NegotiationTheater
            messages={negotiation.messages}
            onDone={() => stage === "negotiating" && setStage("gate")}
          />
        </Section>
      )}

      {/* Stage 3 — Agency gate */}
      {negotiation && (stage === "gate" || stage === "booked") && (
        <Section title="3 · You decide">
          {stage === "booked" ? (
            <div style={{ ...sectionInner, borderColor: "#6ee7a8" }}>
              ✓ Booked with {negotiation.appointment.provider} —{" "}
              {negotiation.appointment.datetime}. Confirmation{" "}
              <b style={{ color: "#6ee7a8" }}>{confirmation}</b>. Reminders set.
            </div>
          ) : (
            <AgencyGate
              coverage={negotiation.coverage}
              appointment={negotiation.appointment}
              onBook={book}
            />
          )}
        </Section>
      )}

      {/* Stage 4 — Owned record + Companion */}
      {stage === "booked" && (
        <>
          <Section title="4 · Your visit becomes your record (you own it)">
            <div style={sectionInner}>
              <Plan k="Diagnosis" v={CARE_PLAN.diagnosis} />
              <Plan k="Medications" v={CARE_PLAN.medications.join(", ")} />
              <Plan k="Techniques" v={CARE_PLAN.techniques.join(" · ")} />
              <Plan k="Follow-up" v={CARE_PLAN.followUp} />
            </div>
          </Section>
          <Section title="5 · When the institutions log off, your agent doesn't">
            <CompanionChat />
          </Section>
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#8a8aa0", marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Plan({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 14 }}>
      <span style={{ width: 110, color: "#8a8aa0" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#0e0e16",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 12,
  color: "#e7e7ef",
  fontSize: 15,
  lineHeight: 1.5,
  resize: "vertical",
  marginBottom: 12,
};

const primaryBtn: React.CSSProperties = {
  background: "#6ea8fe",
  color: "#06122a",
  border: "none",
  borderRadius: 8,
  padding: "11px 20px",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};

const sectionInner: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  fontSize: 15,
  lineHeight: 1.5,
};

const crisisBox: React.CSSProperties = {
  marginTop: 14,
  background: "#3a1620",
  border: "1px solid #e08a8a",
  borderRadius: 10,
  padding: 14,
  fontSize: 14,
  lineHeight: 1.5,
};
