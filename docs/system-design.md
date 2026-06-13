# Healthcare Concierge — System Design

**Status:** Draft v1
**Date:** 2026-06-13
**Author:** Engineering lead (with Claude)
**Scope:** Real startup architecture, designed for a *full thin slice* first build — every stage of the journey functional end-to-end, each one minimal but real.

---

## 1. Product in one sentence

A consumer healthcare concierge reachable by **app or phone number** that takes a user from "something's wrong" to a booked, in-network appointment, then captures the visit and gives them an after-hours, visit-grounded assistant — all coordinated by a multi-agent system over a durable, compliant backbone.

### The five user-visible moments
1. **Talk** — call the number or open the app; a voice agent listens and understands.
2. **Know** — "Here's what your insurance covers and roughly what it'll cost."
3. **Book** — the system finds an in-network clinic, books it, and reminds you.
4. **Remember** — your visit is transcribed into a clear summary and care plan.
5. **Ask** — after hours, ask questions answered *only* from your own records.

---

## 2. Design principles (non-negotiable)

1. **Compliance is a constraint on every arrow, not a feature.** Every data flow that touches PHI is encrypted, logged, consented, and minimized. BAAs with every vendor that sees PHI.
2. **Safety boundary is explicit.** The system never generates *new* medical advice. It triages red flags, surfaces grounded information, and escalates everything else to a human or emergency path.
3. **The LLM is the easy 20%; integrations are the hard 80%.** Every external system sits behind a clean interface so it can be mocked with a realistic stub without touching agent logic.
4. **Durable by default.** This is a multi-day, multi-step workflow with flaky external calls. Steps are idempotent, retryable, and survive process restarts.
5. **Centralized control, specialist execution.** One orchestrator owns state and routing; agents are stateless specialists invoked as tools/steps.

---

## 3. Topology — why a router, not a hand-off pipeline

```
                         ┌─────────────────────────────┐
   App  ───┐             │      ORCHESTRATOR           │
           ├──> Gateway ─┤  (durable workflow engine)  │
  Phone ───┘   (auth,    │  - owns CaseState           │
               consent)  │  - routes to agents         │
                         │  - human-in-the-loop gates  │
                         └──────────────┬──────────────┘
                                        │ invokes as steps
        ┌────────────┬──────────────┬───┴────────┬──────────────┐
        ▼            ▼              ▼            ▼              ▼
   ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐ ┌────────────┐
   │ Intake/ │ │ Coverage │ │ Scheduling │ │ Scribe  │ │ Companion  │
   │ Triage  │ │  Agent   │ │   Agent    │ │ Agent   │ │   Agent    │
   └────┬────┘ └────┬─────┘ └─────┬──────┘ └────┬────┘ └─────┬──────┘
        ▼           ▼             ▼             ▼            ▼
   Voice/STT   Eligibility   Provider dir.   Audio/STT   Vector store
   + LLM       (270/271)     + booking/      + LLM       (per-user,
               clearinghouse  voice-call     summarize    grounded)
```

**Decision: centralized orchestrator (router) over decentralized hand-offs.**
A pure pipeline where each agent hands off to the next is more "autonomous" but (a) loses a single source of truth for case state, (b) makes red-flag short-circuits and human approval gates awkward, and (c) is hell to debug when a long-running case stalls. A central orchestrator that holds `CaseState` and calls specialist agents as durable steps gives us auditability, clean retries, and explicit approval gates — all things a healthcare product is graded on. Agents stay **stateless**: state in, state out.

---

## 4. Agent specifications

Each agent has a strict I/O contract. Agents do not call each other directly — the orchestrator routes.

### 4.1 Intake / Triage Agent  *(voice + chat)*
- **Job:** Conduct a natural conversation to capture the complaint; run a red-flag triage check.
- **In:** live audio/text stream, `UserProfile` (for context).
- **Out:** `IntakeRecord { chiefComplaint, symptoms[], onset, severity, duration, relevantHistory[], triageLevel }`.
- **Tools:** STT (streaming), TTS, LLM with a structured-extraction tool, a deterministic red-flag classifier.
- **Hard rule:** Red-flag symptoms (chest pain, stroke signs, suicidal ideation, anaphylaxis, etc.) short-circuit the *entire* workflow to an emergency-guidance response **before** any coverage/booking logic runs. This check is rule-based first, LLM-assisted second — never LLM-only.
- **Failure handling:** if extraction confidence is low, ask a clarifying question rather than guessing; never fabricate symptoms.

### 4.2 Coverage Agent
- **Job:** Determine *likely* coverage, network status, and expected out-of-pocket cost.
- **In:** `IntakeRecord`, `InsuranceProfile { payer, memberId, planType, group }`.
- **Out:** `CoverageResult { status: covered | not_covered | uncertain, networkStatus, estimatedCost, requiresPriorAuth, rationale, sources[] }`.
- **Tools:** eligibility check via clearinghouse (270/271 EDI through an aggregator), benefit-plan lookup, LLM to map complaint → likely service/CPT category.
- **Hard rule:** output is **three-valued** (covered / not covered / uncertain) — never force a binary. Coverage truly depends on diagnosis codes, prior auth, and network, none of which we fully know pre-visit. Always attach a rationale and a "verify with payer" disclaimer.
- **Failure handling:** if the eligibility API is down or returns ambiguous data → `uncertain` with a clear next step, not a fabricated yes.

### 4.3 Scheduling Agent
- **Job:** Find in-network providers near the user, check availability, book, set reminders.
- **In:** `IntakeRecord`, `CoverageResult`, `UserProfile.location`.
- **Out:** `Appointment { provider, datetime, location, confirmationId, status }` + scheduled reminders.
- **Tools:** provider directory search (geo + specialty + network), two booking paths:
  - **Path A — API booking:** scheduling platform integration where available.
  - **Path B — voice fallback:** an outbound voice agent *calls the clinic* to book on the user's behalf when no API exists. Confirmation is verified by readback/transcript.
- **Hard rule:** booking is a **high-stakes action** behind a human-in-the-loop gate — the user confirms the proposed slot before the agent commits. Idempotent: a retried booking must not double-book.
- **Failure handling:** if booking fails, return candidate slots and ask the user; never silently mark booked.

### 4.4 Scribe Agent
- **Job:** With consent, capture the in-visit encounter, transcribe, and produce a structured summary + care plan.
- **In:** visit audio (consented), `UserProfile`.
- **Out:** `VisitSummary { diagnoses[], medications[], instructions[], followUps[], rawTranscriptRef }`, updated `CarePlan`.
- **Tools:** medical-grade STT (speaker diarization), LLM summarizer constrained to the transcript.
- **Hard rule:** **explicit recording consent** captured before any audio is stored; two-party-consent states handled. Summary is extraction-only — no invented diagnoses; flag low-confidence sections for human review.
- **Failure handling:** if audio quality is poor, store transcript with confidence flags rather than discarding.

### 4.5 Companion Agent  *(the after-hours assistant)*
- **Job:** Answer the user's questions **strictly** from their own visit history and care plan.
- **In:** user question, retrieved chunks from *this user's* `VisitSummary`/`CarePlan` only.
- **Out:** grounded answer **with citations to the source visit**, or an escalation.
- **Tools:** per-user vector store (strict tenant isolation), retrieval, LLM with a refusal/escalation policy.
- **Hard rule (this is the liability boundary):** answers **only** from grounded records. It does **not** impersonate a named clinician, does **not** give new advice, and does **not** answer anything urgent or out-of-scope — those escalate to a human or the emergency path. Framed to the user as "your care assistant," not "Dr. X." This converts the original "virtual doctor with the doctor's personality" idea into a shippable, safe feature.
- **Failure handling:** retrieval miss → "I don't have that in your records; here's how to reach your provider," never a hallucinated answer.

### 4.6 Orchestrator (control plane)
- **Job:** Own `CaseState`, route between agents as durable steps, enforce human-in-the-loop gates, manage the long-running workflow across days.
- **In/Out:** events in, state transitions out.
- **Tools:** durable workflow engine, the shared data store, the audit log.
- **Hard rule:** every PHI-touching step writes to the audit log; every high-stakes action (book, escalate) passes an approval gate.

---

## 5. Shared data model

```
UserProfile      { id, name, dob, location, contact, consentFlags }
InsuranceProfile { userId, payer, memberId, planType, group, network }
IntakeRecord     { caseId, chiefComplaint, symptoms[], onset, severity,
                   duration, history[], triageLevel, createdAt }
CoverageResult   { caseId, status, networkStatus, estimatedCost,
                   requiresPriorAuth, rationale, sources[], checkedAt }
Appointment      { caseId, provider, datetime, location, confirmationId,
                   status, reminders[] }
VisitSummary     { caseId, diagnoses[], medications[], instructions[],
                   followUps[], transcriptRef, confidenceFlags[] }
CarePlan         { userId, goals[], medications[], nextSteps[], updatedAt }
CaseState        { caseId, userId, stage, history[], pendingApprovals[] }
AuditLog         { actor, action, phiAccessed, caseId, timestamp }
```

`CaseState.stage` is the workflow's position: `intake → coverage → scheduling → (visit) → scribe → companion-ready`. State survives restarts because it lives in the durable store, not in agent memory.

---

## 6. End-to-end data flow — one journey

1. **User calls the number.** Gateway authenticates, captures session consent, opens a `Case`.
2. **Intake/Triage** streams the conversation → `IntakeRecord`. Red-flag check passes (not an emergency).
3. **Orchestrator** advances stage to `coverage`, invokes **Coverage Agent** → `CoverageResult { covered, in-network, ~$40 copay }`.
4. **Orchestrator** advances to `scheduling`, invokes **Scheduling Agent** → proposes 3 slots → **user confirms** (HITL gate) → books → schedules reminders.
5. **(Days later) Visit happens.** User taps "record visit" → consent captured → **Scribe Agent** transcribes → `VisitSummary` + updated `CarePlan`. Companion's per-user vector store is indexed.
6. **That evening, clinic closed.** User asks "what dose did they say for the antibiotic?" → **Companion Agent** retrieves from *this visit only* → grounded answer with citation. An out-of-scope question ("should I increase the dose?") → escalation, not advice.

Every step writes to `AuditLog`. Every external call is a durable, idempotent, retryable step.

---

## 7. Compliance & safety design

| Area | Decision |
|------|----------|
| **PHI handling** | Encrypted at rest and in transit; field-level encryption for identifiers; data minimization per agent (each agent gets only what it needs). |
| **BAAs** | Required with every vendor that touches PHI (telephony, STT, LLM, eligibility, storage). Use HIPAA-eligible tiers only. |
| **Consent** | Session consent at intake; **explicit, separate recording consent** before any visit audio is captured; two-party-consent-state aware. |
| **Audit** | Append-only `AuditLog` of every PHI access and every action, keyed by case and actor. |
| **Retention** | Defined retention windows; user-initiated deletion path. |
| **Clinical safety** | Rule-first red-flag triage; no AI-generated new medical advice; mandatory "not medical advice / not a diagnosis" framing; HITL gates on booking and any escalation. |
| **Companion safety** | Grounded-only answers, per-user tenant isolation, refusal + escalation policy, no clinician impersonation. |

---

## 8. Reliability & durability

- **Durable execution engine** (e.g., a workflow/queue system with at-least-once delivery) runs each agent invocation as a checkpointed step. A crash mid-booking resumes, it doesn't lose the user's intake.
- **Idempotency keys** on every external mutation (booking especially) prevent double-actions on retry.
- **Timeouts + compensating actions:** a hung clinic phone call times out and falls back to presenting slots to the user.
- **Dead-letter + human review** for steps that exhaust retries.

---

## 9. Integration boundaries & recommended vendors

Each boundary is an interface with a real implementation and a stub implementation.

| Boundary | Interface | Real option (HIPAA-eligible) | Stub for early build |
|----------|-----------|------------------------------|----------------------|
| Telephony / voice | `VoiceChannel` | Voice-agent platform (Vapi / Retell / Twilio + Bland-style) | Web mic + browser |
| Speech-to-text | `Transcriber` | Deepgram / AssemblyAI / Whisper (BAA tier) | Canned transcripts |
| LLM reasoning | `Reasoner` | Claude via a HIPAA-eligible deployment | Same, low temp |
| Eligibility | `EligibilityProvider` | Clearinghouse/aggregator (Stedi / Availity, 270/271) | Mock payer returning fixtures |
| Scheduling | `Scheduler` | Scheduling platform API + voice-call fallback | Mock provider directory + fake slots |
| Storage / vector | `Store`, `VectorStore` | HIPAA-eligible DB + isolated per-user vector index | Local store |
| Workflow | `WorkflowEngine` | Durable execution (Temporal / Inngest-style) | In-memory queue |

> **Stack note:** these are pluggable. Verify HIPAA eligibility and BAA availability for the *specific tier* of each vendor before production — eligibility varies by plan, not just by company.

---

## 10. Build order — full thin slice first

Goal: a working end-to-end path through **all five stages**, each minimal but real, before deepening any one stage.

- **Milestone 0 — Skeleton:** Orchestrator + `CaseState` + the durable workflow loop, with all six agents as stub steps. End-to-end "case" flows through every stage with hardcoded data. *Proves the topology.*
- **Milestone 1 — Intake real:** Real voice/text intake → structured `IntakeRecord` + red-flag triage. Other stages still stubbed.
- **Milestone 2 — Coverage real:** Eligibility behind the `EligibilityProvider` interface (mock payer fixtures first, then a real clearinghouse sandbox). Three-valued output.
- **Milestone 3 — Scheduling real:** Provider search + booking via API path; HITL slot confirmation; reminders. Voice-call fallback last.
- **Milestone 4 — Scribe real:** Consent flow → transcription → `VisitSummary` + `CarePlan`.
- **Milestone 5 — Companion real:** Per-user vector store + grounded retrieval + refusal/escalation policy.
- **Milestone 6 — Compliance hardening:** Audit log, encryption, BAAs, retention/deletion, consent edge cases.

Each milestone keeps every other stage working — the slice never breaks, it only deepens.

---

## 11. Top technical risks & mitigations

| # | Risk | Why it's dangerous | Mitigation |
|---|------|--------------------|------------|
| 1 | **Coverage determination is genuinely hard** | "Is it covered?" depends on data we don't have pre-visit (Dx codes, prior auth, network). | Three-valued output + rationale + "verify with payer"; never claim certainty. |
| 2 | **Booking has no universal API** | Most clinics can't be booked programmatically. | Dual path: API where it exists, outbound voice-agent call where it doesn't; HITL confirm. |
| 3 | **Companion liability** | A synthetic "Dr. X" giving advice is a lawsuit. | Grounded-only, no impersonation, escalate out-of-scope; framed as a care assistant. |
| 4 | **PHI leakage / compliance gap** | One unencrypted log or missing BAA is a breach. | Compliance-by-design: encryption, BAAs, audit, minimization from Milestone 0. |
| 5 | **Recording consent** | Recording a visit without proper consent is illegal in two-party states. | Explicit recording-consent gate before any audio is captured or stored. |
| 6 | **Long-running workflow fragility** | Multi-day cases with flaky external calls lose state. | Durable execution, idempotency keys, compensating actions, dead-letter review. |
| 7 | **Red-flag miss** | Missing an emergency symptom is the worst-case outcome. | Rule-first triage, LLM second; conservative escalation bias. |

---

## 12. Open questions for next iteration

- Which **vertical** to launch in (e.g., urgent care, primary care, a specialty)? Narrower = far easier coverage + scheduling.
- **Payer coverage strategy:** which insurers/clearinghouses first?
- **Build vs. buy** the voice layer (own the telephony stack vs. a voice-agent platform).
- Regulatory posture: are we a **care navigator/concierge** (lighter) or do we ever touch clinical decision support (heavier)?
