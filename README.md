# The Patient's Agent

> Everyone at the table already has an agent — the hospital, the clinic, the insurer. Everyone except the patient. **This is theirs.**

A patient-side AI agent that represents you in the agent-to-agent healthcare world that's coming: it negotiates coverage with the insurer's agent, negotiates an appointment with the clinic's agent, lets *you* make the call, and gives you an after-hours companion grounded in your own records.

Built for the Legion Health x Atlas AI hackathon. Theme: **patient agency**. Tagline: *the future of care is autonomous*.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — runs in mock mode with no keys
npm run dev                  # http://localhost:3000
```

**It runs with zero API keys** (deterministic mock reasoning). Add an **xAI / Grok** key in `.env.local` to make the agents LLM-voiced — and to qualify for the xAI sponsor track.

## Telephony bridge (Twilio + Grok Voice)

Run the live phone bridge service:

```bash
npm run telephony:bridge
```

Setup steps and Twilio webhook config are documented in [`docs/telephony-bridge.md`](docs/telephony-bridge.md).

## The demo flow (one page, scripted happy path)

1. **Intake** — describe the problem; rule-first crisis triage (988 escalation if needed).
2. **A2A negotiation** — split-screen: your agent vs. the insurer's agent (wins on mental-health parity) and the clinic's agent (wins a near-term telehealth slot). ← the money shot.
3. **Agency gate** — your agent did the labor; *you* tap "Book it".
4. **Owned record** — the visit becomes the patient's own care plan.
5. **Companion** — after-hours, grounded-in-your-notes Q&A with crisis escalation.

## Architecture

| Piece | File | Notes |
|-------|------|-------|
| A2A protocol | `lib/a2a/types.ts` | Typed agent-to-agent messages (MCP/Google-A2A shaped) |
| Patient agent (orchestrator) | `lib/agents/patient.ts` | Step-shaped, Inngest-ready |
| Payer agent (mock, adversarial) | `lib/agents/payer.ts` | Serves the insurer |
| Clinic agent (mock, adversarial) | `lib/agents/clinic.ts` | Serves the clinic |
| Companion (grounded RAG) | `lib/companion.ts` | Answers only from `lib/data/transcript.ts`, escalates crisis |
| LLM client | `lib/llm.ts` | OpenAI-compatible; defaults to xAI/Grok; mock fallback |
| Visualizer | `components/NegotiationTheater.tsx` | The split-screen |

## Sponsor tracks — where to plug in

- **xAI (Grok):** set `LLM_API_KEY` in `.env.local`. Already the default provider.
- **Inngest:** make the orchestrator a durable workflow — see `lib/inngest.example.ts`.
- **Vercel:** `vercel deploy` for a shareable URL; optionally route the LLM through AI Gateway.
- **Voice (Vapi/Retell):** replace the intake textarea with a phone agent; point its LLM at Grok.

## Build order

See `docs/hackathon-winning-plan.md` for the hour-by-hour plan, team split, demo script, and risk list. The system design (production version) is in `docs/system-design.md`.

## Priority if time runs short

1. Scheduling negotiation (the hero beat) → 2. Coverage negotiation → 3. Agency gate + booking → 4. Companion closer → 5. Voice (text fallback already works).
