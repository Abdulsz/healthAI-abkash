"use client";

import { useEffect, useState } from "react";
import { A2AMessage } from "@/lib/a2a/types";

// The money shot: a split screen of the patient's agent (left) negotiating
// agent-to-agent with the institutional agents (right), revealed one message
// at a time so the room watches two AIs transact live.

const LABEL: Record<string, string> = {
  patient: "🧑‍⚖️ Your Agent",
  payer: "🏦 Insurer's Agent",
  clinic: "🏥 Clinic's Agent",
};

const INTENT_COLOR: Record<string, string> = {
  "coverage.request": "var(--blue)",
  "coverage.offer": "var(--ink)",
  "coverage.dispute": "var(--blue)",
  "coverage.settle": "var(--blue)",
  "schedule.request": "var(--blue)",
  "schedule.offer": "var(--ink)",
  "schedule.counter": "var(--blue)",
  "schedule.confirm": "var(--blue)",
};

export default function NegotiationTheater({
  messages,
  onDone,
}: {
  messages: A2AMessage[];
  onDone: () => void;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= messages.length) {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 300 : 1300);
    return () => clearTimeout(t);
  }, [shown, messages.length, onDone]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        minHeight: 360,
      }}
    >
      <Column side="patient" messages={messages.slice(0, shown)} />
      <Column side="institution" messages={messages.slice(0, shown)} />
    </div>
  );
}

function Column({
  side,
  messages,
}: {
  side: "patient" | "institution";
  messages: A2AMessage[];
}) {
  const mine = messages.filter((m) =>
    side === "patient" ? m.from === "patient" : m.from !== "patient"
  );
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "var(--ink-soft)",
          marginBottom: 4,
        }}
      >
        {side === "patient" ? "Patient side" : "Institution side"}
      </div>
      {mine.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
    </div>
  );
}

function Bubble({ m }: { m: A2AMessage }) {
  return (
    <div
      style={{
        border: `1px solid ${INTENT_COLOR[m.intent] ?? "var(--border)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        animation: "fade 0.4s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{LABEL[m.from]}</strong>
        <span
          style={{
            fontSize: 10,
            color: INTENT_COLOR[m.intent] ?? "var(--ink-soft)",
            fontFamily: "monospace",
          }}
        >
          {m.intent}
        </span>
      </div>
      <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>{m.text}</div>
    </div>
  );
}
