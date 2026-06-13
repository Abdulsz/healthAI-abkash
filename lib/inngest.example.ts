// ─────────────────────────────────────────────────────────────────────────
// INNGEST WIRING TEMPLATE (sponsor track) — not active yet.
//
// The patient agent in lib/agents/patient.ts is already STEP-SHAPED. To make it
// a durable Inngest workflow (and get the live dashboard of the multi-agent flow
// executing — a great demo visual), do this:
//
// 1. npm install inngest
// 2. Create app/api/inngest/route.ts:
//      import { serve } from "inngest/next";
//      import { inngest, negotiateCare } from "@/lib/inngest.example";
//      export const { GET, POST, PUT } = serve({ client: inngest, functions: [negotiateCare] });
// 3. Move each labeled section of runNegotiation() into a step.run(...) below.
// 4. In app/api/negotiate/route.ts, call inngest.send({ name: "care/requested", data: { intake } })
//    and stream the result (or poll a status record).
// 5. npx inngest-cli@latest dev   →   open http://localhost:8288 for the dashboard.
// ─────────────────────────────────────────────────────────────────────────

/*
import { Inngest } from "inngest";
import { runNegotiation } from "./agents/patient";
import { IntakeRecord } from "./a2a/types";

export const inngest = new Inngest({ id: "patients-agent" });

export const negotiateCare = inngest.createFunction(
  { id: "negotiate-care" },
  { event: "care/requested" },
  async ({ event, step }) => {
    const intake = event.data.intake as IntakeRecord;

    const coverage = await step.run("negotiate-coverage", async () => {
      // ...the coverage section of runNegotiation()
    });

    const appointment = await step.run("negotiate-scheduling", async () => {
      // ...the scheduling section
    });

    // await step.waitForEvent("patient-approval", { event: "care/approved", timeout: "1h" });
    // const booking = await step.run("book", async () => { ... });

    return { coverage, appointment };
  }
);
*/

export {};
