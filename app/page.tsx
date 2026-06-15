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
    <main className="in-main" style={{ maxWidth: 920 }}>
      <header
        className="in-reveal"
        style={{ animationDelay: "0.05s", marginBottom: 34, paddingTop: 12 }}
      >
        <p className="in-kicker">A2A · Patient Advocacy</p>
        <h1 className="in-title">
          The patient&apos;s <em>agent</em>.
        </h1>
        <p className="in-lede">
          Everyone at the table already has an agent — the hospital, the clinic, the
          insurer. Everyone except the patient. This is theirs.
        </p>
        <div style={{ marginTop: 18 }}>
          <Link
            href="/insurance-navigator"
            className="in-btn in-btn-secondary"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            Open Insurance Navigator →
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
          <div style={{ fontSize: 14, color: "var(--vital)", marginTop: 12 }}>
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
            <div style={{ ...sectionInner, borderColor: "var(--vital)" }}>
              ✓ Booked with {negotiation.appointment.provider} —{" "}
              {negotiation.appointment.datetime}. Confirmation{" "}
              <b style={{ color: "var(--vital)" }}>{confirmation}</b>. Reminders set.
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
    <section style={{ marginBottom: 30 }}>
      <h2
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--accent-deep)",
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Plan({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", fontSize: 15 }}>
      <span
        style={{
          width: 120,
          flexShrink: 0,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--ink-soft)",
        }}
      >
        {k}
      </span>
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
  background: "var(--field)",
  border: "1px solid transparent",
  borderRadius: 12,
  padding: 14,
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  lineHeight: 1.55,
  resize: "vertical",
  marginBottom: 14,
};

const primaryBtn: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 15,
  fontWeight: 600,
  background: "linear-gradient(180deg, #c08e22, var(--accent-deep))",
  color: "var(--accent-text)",
  border: "1px solid var(--accent-deep)",
  borderRadius: 13,
  padding: "13px 22px",
  cursor: "pointer",
  boxShadow: "0 14px 30px -16px rgba(138, 94, 14, 0.9)",
};

const sectionInner: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 18,
  padding: 22,
  fontSize: 15,
  lineHeight: 1.55,
  boxShadow: "var(--shadow-soft)",
  backdropFilter: "blur(12px)",
};

const crisisBox: React.CSSProperties = {
  marginTop: 16,
  background: "var(--danger-soft)",
  border: "1px solid var(--danger-soft)",
  borderLeft: "3px solid var(--danger)",
  borderRadius: 12,
  padding: 16,
  fontSize: 15,
  lineHeight: 1.55,
};
