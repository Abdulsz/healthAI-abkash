"use client";

import { useState } from "react";

// The closer: the after-hours Companion. Answers ONLY from Maya's own visit
// notes (cited), and escalates crisis to 988. "When the institutions log off,
// your agent doesn't."

interface Turn {
  role: "user" | "agent";
  text: string;
  citation?: string;
  escalation?: boolean;
}

const SUGGESTED = [
  "What breathing technique did Dr. Chen suggest for night panic attacks?",
  "When do I take my medication and when will it kick in?",
  "When is my follow-up?",
];

export default function CompanionChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setTurns((t) => [...t, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const a = await res.json();
      setTurns((t) => [
        ...t,
        {
          role: "agent",
          text: a.text,
          citation: a.citation,
          escalation: a.type === "escalation",
        },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "agent", text: "Something went wrong reaching your records." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {turns.length === 0 && (
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            It&apos;s 11pm and the clinic is closed. Ask your agent — it answers from
            your own session notes.
          </div>
        )}
        {turns.map((t, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: t.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: t.role === "user" ? "var(--blue)" : "rgba(49, 95, 239, 0.055)",
              color: t.role === "user" ? "var(--white)" : "var(--ink)",
              border: `1px solid ${t.escalation ? "var(--ink)" : "var(--border)"}`,
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {t.text}
            {t.citation && (
              <div style={{ marginTop: 6, fontSize: 11, color: t.role === "user" ? "var(--white)" : "var(--blue)" }}>
                ↳ source: {t.citation}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            disabled={busy}
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your care companion…"
          style={{
            flex: 1,
            background: "var(--white)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--ink)",
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            background: "var(--blue)",
            color: "var(--white)",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
