# Hackathon Winning Plan — *The Patient's Agent*

**Event:** Legion Health x Atlas AI — Health AI hackathon (SF, 1 day)
**Tagline (theirs):** "The future of care is autonomous."
**Theme:** **Patient agency**
**Sponsors:** xAI · Vercel · Cursor · Inngest · ($40k+ — assume per-sponsor tracks)
**Team:** 2–3 · build ~9am–6pm, demos 6pm

---

## 0. The thesis (open and close the pitch with this)

> **"When you deal with healthcare, everyone at the table already has an agent working for them — the hospital, the clinic, the insurer. Everyone except the patient. Tonight we built yours."**

Soon every provider and payer will run their own AI agents, each optimized for *the institution* — fill slots, maximize revenue, minimize payouts, deny the marginal claim. A patient with no agent becomes the only human in a room full of institutional AIs negotiating against their time and money. **That's the collapse of patient agency, not its fulfillment.**

Our product is the patient's own agent: it sits on *their* side of the table and **negotiates, books, disputes, and represents them** against every institutional agent on the other side.

This single reframe does three things at once:
1. **Differentiates** — almost every team builds a patient tool that pokes at today's human/portal system. We build for the *agent-to-agent* world that's actually coming. Uncrowded.
2. **Nails the tagline** — agent-to-agent negotiation is the purest "autonomous care" demo possible.
3. **Resolves the autonomy/agency paradox** — full autonomy is *desirable* here precisely because the other side is fully autonomous too. Asymmetry of automation = asymmetry of power. We're the equalizer.

---

## 1. Utilize AND tackle the "every provider has an agent" future

- **Utilize:** when the clinic/payer has an agent, our agent talks to it **agent-to-agent** over a clean protocol (the role **MCP** and **Google's A2A** protocol are being built for) — no portal scraping, no calling humans. The future makes our integration problem *disappear*.
- **Tackle:** those institutional agents are adversarial by design. Our agent is the patient's **counterparty** — it audits the bill, negotiates the slot, disputes the denial. The only agent in the room representing the human.

---

## 2. The character & narrative (behavioral health — keeps Legion home-field)

> **Maya, 26.** New to SF, new insurance she doesn't understand. 9pm, first panic attack. She doesn't need an app to read — she needs *representation*.

---

## 3. The demo script (one perfect run ≈ 3 min)

| # | Beat | Real / Faked | What the room sees |
|---|------|--------------|--------------------|
| 1 | Maya **calls the number**; her agent (voice) listens, captures the problem, runs a gentle **safety check** → proceeds | **REAL** (voice + Grok) | An agent that listens, and knows when *not* to proceed |
| 2 | "Let me represent you with your insurer." → **agent-to-agent**: the **Payer Agent** says "needs referral, partial coverage"; Maya's agent **pushes back citing mental-health parity** → payer concedes: covered, $30 copay | **REAL A2A** (mock payer) | Her agent *winning an argument* with the insurer's agent |
| 3 | 🏆 "Now finding care." → **agent-to-agent**: the **Clinic Agent** offers "next opening in 3 weeks"; Maya's agent **negotiates** — cancellation list? telehealth? → clinic agent yields **Thursday 4pm telehealth** | **REAL A2A** (mock clinic) | **Two AIs negotiating live, on a split screen.** The clip. |
| 4 | **Agency gate:** her agent summarizes — "Covered, $30, Dr. Chen Thu 4pm, here's why I recommend her. Book it?" → **Maya taps yes** | **REAL** | The patient *decides*; the agent does the labor |
| 5 | Time jump: session happens → her agent produces **her own** session record + care plan. "This is Maya's, not the clinic's." | FAKED transcript | She *owns* her data |
| 6 | 💔 **Closer:** 11pm, spiraling, therapist offline → she talks to her agent, which answers **from her own session notes**, cited, and escalates crisis to 988. "When the institutions log off, your agent doesn't." | **REAL** (grounded RAG) | Representation that never sleeps |

**Open line:** the thesis quote (§0).
**Close line:** *"Everyone at the table has an agent. Now the patient does too. That's patient agency."* → one vision slide → sit down.

**Safety beat (show it):** the intake triage detects crisis language → surfaces **988** + human handoff. In behavioral health this is non-negotiable, and judges in this field will respect that you built the guardrail.

---

## 4. Architecture

```
   Phone / App
        │  (voice, Grok)
        ▼
 ┌─────────────────────────────┐        A2A protocol (structured JSON
 │     PATIENT AGENT           │        messages; MCP / Google-A2A shaped)
 │  orchestrated by INNGEST    │◄──────────────┐
 │  (durable multi-step flow)  │               │
 │  intake → negotiate cover-  │      ┌─────────┴──────────┐
 │  age → negotiate scheduling │◄────▶│  PAYER AGENT (mock)│  adversarial:
 │  → AGENCY GATE → book →     │      │  serves the insurer│  deny / minimize
 │  scribe → companion         │      └────────────────────┘
 └──────────┬──────────────────┘      ┌────────────────────┐
            │                  ◄──────▶│ CLINIC AGENT (mock)│  adversarial:
            ▼                          │  serves the clinic │  stall / upsell
   Grounded Companion (RAG,            └────────────────────┘
   per-user, cited, escalates)
```

- **Patient Agent** = our product. An **Inngest** durable workflow: `intake → negotiate-coverage → negotiate-scheduling → await-approval → book → (visit) → scribe → companion-ready`. Reasoning via **Grok**. The negotiation steps (offer → counter → settle) are a flagship durable-workflow showcase, and the **Inngest dashboard of the flow executing is itself a demo visual.**
- **Institutional Agents (mock, we control)** = Payer Agent + Clinic Agent, each a small Grok-driven service with an *institution-serving objective* so their counters are genuinely reasoned, not scripted. Building both sides is honest — provider agents barely exist yet; we demonstrate the protocol *and* control the run.
- **A2A protocol** = a lightweight structured message contract over HTTP endpoints (cite MCP / Google A2A as the real standards). **Define this schema first — it's the key interface.**
- **Agency gate** = the patient confirms before any commitment. The agent does the *labor*; the patient keeps the *decisions*.
- **Companion** = per-user RAG over the (canned) session transcript; cited answers, crisis escalation. The "virtual doctor" reframed safely — grounded, never a synthetic clinician.

---

## 5. Real vs. faked (so nothing breaks on stage)

- **REAL:** voice intake, the **A2A negotiation engine + both agents**, the agency-approval gate, the grounded Companion, the 988 escalation.
- **FAKED (hardcoded, convincing):** the institutional agents' knowledge (coverage rules, slot inventory), the visit transcript (pre-loaded). They still *behave* adversarially so the negotiation is real.
- **CUT:** real payer/clinic integrations, auth, multi-user, persistence beyond the demo.

---

## 6. Team split (3 people, parallel from hour one)

- **A — Patient Agent spine (owns the patient side):** voice intake → Inngest orchestrator → agency gate → booking. Strongest builder; this is the product.
- **B — Institutional agents + A2A engine (owns the hero moment):** Payer Agent + Clinic Agent with adversarial Grok objectives, the A2A message protocol, and the negotiation logic. This is what makes the split-screen sing.
- **C — Frontend + the money shot:** the **live split-screen A2A negotiation visualizer**, app screens, agency-gate UI, Companion chat + RAG wiring, the **backup recording**, the deck.

*(2 people: A takes patient spine + voice; B takes institutional agents + A2A + visualizer; share Companion + deck.)*

**Priority order if time runs short:** (1) scheduling negotiation hero beat → (2) coverage negotiation → (3) agency gate + booking → (4) Companion closer → (5) voice (text fallback if needed).

---

## 7. Hour-by-hour (mapped to their schedule)

Doors 8:30 · kickoff 9:00 · lunch 12:00 · **demos 6:00** · awards 7:30.

- **9:00–10:00 — Lock & contract.** Freeze the script (§3). **Define the A2A message schema first** (the patient↔institution contract). Stand up the Inngest skeleton (all steps as stubs), Vercel project, Grok + voice accounts. Prove an empty case flows through every Inngest step.
- **10:00–12:00 — Parallel core.** A: voice intake → structured problem into the orchestrator. B: Payer + Clinic agents answering A2A messages with adversarial logic + counters. C: split-screen visualizer rendering a message exchange + app shell.
- **12:00–12:30 — Lunch + de-risk.** Confirm voice and one full A2A round-trip work end-to-end with stubs. If voice is shaky, commit to text intake now.
- **12:30–3:30 — Integrate the hero.** Orchestrator drives both institutional agents through coverage + scheduling negotiation; visualizer shows it live; agency gate → booking works.
- **3:30–4:30 — First full run + safety net.** Run the whole 3-min script. **The instant it works once, record the clean backup video.** Add 988. Add the Companion closer if on track.
- **4:30–5:30 — Polish & pitch.** Make the negotiation visualizer *beautiful* (it's the money shot); cue the Inngest dashboard as "real multi-agent orchestration" proof; build the **3-slide deck** (problem → live demo → vision).
- **5:30–6:00 — Rehearse 5+ times.** Lock who narrates, who drives, who triggers each agent.

---

## 8. Stack (speed + sponsor coverage)

| Layer | Choice | Sponsor |
|-------|--------|---------|
| App / deploy | Next.js on **Vercel** (shareable URL) | Vercel |
| Orchestration | **Inngest** durable workflow = the patient agent | Inngest |
| Reasoning | **xAI Grok** (patient agent + institutional agents), fronted by Vercel AI Gateway | xAI |
| Voice | Vapi / Retell (LLM → Grok); don't hand-build telephony | — |
| A2A | Lightweight JSON message protocol; cite **MCP / Google A2A** | (technical cred) |
| Retrieval | Simple embeddings over one transcript (in-memory ok) | — |
| Built in | **Cursor** | Cursor |

One coherent build → **4 theme pillars + 4 sponsor tracks.**

---

## 9. Top risks & mitigations

1. **Negotiation looks scripted.** → Institutional agents genuinely reason via Grok (dynamic counters), constrained enough to stay on-rails. Backup video ready.
2. **Too many agents for one day.** → Protect the *scheduling* negotiation as the single hero; coverage second; Companion cuttable.
3. **"You're playing both sides — is it real?"** → Own it: "Provider agents are coming; we built one to show the protocol. The *patient* agent is the real product, and it's the side that doesn't exist yet." Honest and forward-looking.
4. **Live phone/voice flakes.** → Text-intake fallback + the backup recording. "Here's a run from this morning" beats a frozen stage.
5. **Agency tension ("the AI decides for you").** → The approval gate is front-and-center: agent does the labor, patient makes the call. Say it out loud.

---

## 10. Why this wins

- **Thesis a judge repeats to another judge:** *"They built the patient's agent — for the world where everyone else already has one."*
- **Most on-tagline:** agent-to-agent IS autonomous care.
- **Deepest read of the theme:** agency as *representation*, not just navigation.
- **Best technical showcase:** multi-agent orchestration (Inngest) + emerging interop (MCP/A2A) + Grok + a beautiful live visualization.
- **Keeps your full original pipeline** — report → check → advise → negotiate/book → transcribe → companion — now with a sharp, uncrowded spine.
