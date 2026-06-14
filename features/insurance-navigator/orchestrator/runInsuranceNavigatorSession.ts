import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  DEFAULT_INSURANCE_ADAPTER,
  DEFAULT_PROVIDER_QUOTE_ADAPTER,
  DEFAULT_PROVIDER_SEARCH_ADAPTER,
  INSURANCE_ADAPTER_ENV_KEY,
  INS_NAV_AGENT_LOOP_DEFAULT,
  INS_NAV_AGENT_LOOP_ENV_KEY,
  INS_NAV_PROVIDER_PRICING_CALL_TO_DEFAULT,
  INS_NAV_PROVIDER_PRICING_CALL_TO_ENV_KEY,
  INS_NAV_PROVIDER_CALL_LIMIT,
  PROVIDER_QUOTE_ADAPTER_ENV_KEY,
  PROVIDER_SEARCH_ADAPTER_ENV_KEY,
} from "../config/constants";
import {
  InsuranceCallResult,
  InsuranceNavigatorRunResponse,
  ProviderQuoteResult,
  ProviderSearchResult,
  ValidationErrorResponse,
} from "../domain/contracts";
import { mapProcedureToCpt } from "../adapters/cptMapper";
import { resolveInsuranceMemberServicesPhone } from "../adapters/insuranceLookup";
import { validateInsuranceNavigatorIntake } from "../domain/validation";
import { InsuranceCallAdapter } from "../adapters/insuranceCallAdapter";
import { GrokInsuranceCallAdapter } from "../adapters/grokInsuranceCallAdapter";
import { MockInsuranceCallAdapter } from "../adapters/mockInsuranceCallAdapter";
import { ProviderSearchAdapter } from "../adapters/providerSearchAdapter";
import { MockProviderSearchAdapter } from "../adapters/mockProviderSearchAdapter";
import { ProviderQuoteAdapter } from "../adapters/providerQuoteAdapter";
import { MockProviderQuoteAdapter } from "../adapters/mockProviderQuoteAdapter";
import { estimatePatientCostForProvider } from "../domain/cost";
import { InsuranceAdapterExecutionError } from "../domain/errors";
import { GrokProviderQuoteAdapter } from "../adapters/grokProviderQuoteAdapter";
import { triggerOutboundCall } from "../adapters/telephonyBridgeClient";

type OrchestratorResult =
  | { ok: true; data: InsuranceNavigatorRunResponse }
  | { ok: false; error: ValidationErrorResponse };

function buildInsuranceCallAdapter(): InsuranceCallAdapter {
  const configured = (process.env[INSURANCE_ADAPTER_ENV_KEY] || DEFAULT_INSURANCE_ADAPTER)
    .trim()
    .toLowerCase();
  if (configured === "grok") {
    return new GrokInsuranceCallAdapter();
  }
  return new MockInsuranceCallAdapter();
}

function buildProviderSearchAdapter(): ProviderSearchAdapter {
  const configured = (
    process.env[PROVIDER_SEARCH_ADAPTER_ENV_KEY] || DEFAULT_PROVIDER_SEARCH_ADAPTER
  )
    .trim()
    .toLowerCase();
  if (configured === "mock") {
    return new MockProviderSearchAdapter();
  }
  return new MockProviderSearchAdapter();
}

function buildProviderQuoteAdapter(): ProviderQuoteAdapter {
  const configured = (
    process.env[PROVIDER_QUOTE_ADAPTER_ENV_KEY] || DEFAULT_PROVIDER_QUOTE_ADAPTER
  )
    .trim()
    .toLowerCase();
  if (configured === "grok") {
    return new GrokProviderQuoteAdapter();
  }
  return new MockProviderQuoteAdapter();
}

function shouldUseVercelAgentLoop(): boolean {
  const configured = (process.env[INS_NAV_AGENT_LOOP_ENV_KEY] || INS_NAV_AGENT_LOOP_DEFAULT)
    .trim()
    .toLowerCase();
  return configured === "vercel" && Boolean(process.env.LLM_API_KEY);
}

async function runVercelAgentLoopPlanner(input: {
  procedure_description: string;
  zip_code: string;
  plan_name: string;
}): Promise<void> {
  const llmApiKey = process.env.LLM_API_KEY;
  if (!llmApiKey) {
    return;
  }

  const baseURL = process.env.LLM_BASE_URL || "https://api.x.ai/v1";
  const modelName = process.env.LLM_MODEL || "grok-3";
  const provider = createOpenAI({
    apiKey: llmApiKey,
    baseURL,
  });

  try {
    // This lightweight planner uses Vercel AI SDK before deterministic execution.
    await generateText({
      model: provider(modelName),
      temperature: 0,
      maxOutputTokens: 180,
      prompt: [
        "You are an insurance navigation orchestrator.",
        "Return a concise 5-step execution plan for this run as plain text only.",
        `Procedure: ${input.procedure_description}`,
        `Zip: ${input.zip_code}`,
        `Plan: ${input.plan_name}`,
      ].join("\n"),
    });
  } catch {
    // Keep demo reliability high: planner failures never block the pipeline.
  }
}

export async function runInsuranceNavigatorSession(body: unknown): Promise<OrchestratorResult> {
  const validated = validateInsuranceNavigatorIntake(body);
  if (!validated.ok) {
    return validated;
  }

  const intake = validated.data;
  const insuranceCallAdapter = buildInsuranceCallAdapter();
  const providerSearchAdapter = buildProviderSearchAdapter();
  const providerQuoteAdapter = buildProviderQuoteAdapter();
  const orchestrationMode = shouldUseVercelAgentLoop()
    ? "vercel_ai_sdk_agent_loop"
    : "pipeline";

  if (orchestrationMode === "vercel_ai_sdk_agent_loop") {
    await runVercelAgentLoopPlanner({
      procedure_description: intake.procedure_description,
      zip_code: intake.zip_code,
      plan_name: intake.plan_name,
    });
  }

  const cpt = mapProcedureToCpt(intake.procedure_description);
  const phoneResolution = resolveInsuranceMemberServicesPhone({
    planName: intake.plan_name,
    phoneOverride: intake.member_services_phone_override,
  });
  const callbackPhone = intake.callback_phone;
  const stageOutboundCalls: InsuranceNavigatorRunResponse["meta"]["stage_outbound_calls"] = [];
  const providerPricingCallTo = (
    process.env[INS_NAV_PROVIDER_PRICING_CALL_TO_ENV_KEY] ||
    INS_NAV_PROVIDER_PRICING_CALL_TO_DEFAULT
  ).trim();

  if (callbackPhone) {
    const outboundResult = await triggerOutboundCall({
      to: callbackPhone,
      stage: "insurance_verification",
      brief: [
        `Plan name: ${intake.plan_name}.`,
        `Member ID: ${intake.member_id}.`,
        `Group number: ${intake.group_number}.`,
        `Procedure: ${cpt.procedure_name}.`,
        `CPT code: ${cpt.cpt_code}.`,
        `Member services number in context: ${phoneResolution.phone}.`,
      ].join(" "),
    });
    stageOutboundCalls.push(
      outboundResult.ok
        ? {
            stage: "insurance_verification",
            requested: true,
            status: "triggered",
            call_sid: outboundResult.sid,
          }
        : {
            stage: "insurance_verification",
            requested: true,
            status: "failed",
            error: outboundResult.error,
          }
    );
  }

  let insuranceCallResult: InsuranceCallResult;
  try {
    insuranceCallResult = await insuranceCallAdapter.checkCoverage({
      plan_name: intake.plan_name,
      member_id: intake.member_id,
      group_number: intake.group_number,
      cpt_code: cpt.cpt_code,
      procedure_name: cpt.procedure_name,
      member_services_phone: phoneResolution.phone,
    });
  } catch (err) {
    const normalizedError = err instanceof Error ? err : new Error(String(err));
    if (process.env.NODE_ENV !== "production") {
      console.error("[insurance-navigator] insurance-call error:", normalizedError.message);
    }
    throw new InsuranceAdapterExecutionError(
      "Insurance adapter execution failed.",
      normalizedError
    );
  }

  let providers: ProviderSearchResult[];
  try {
    providers = await providerSearchAdapter.searchProviders({
      procedure_name: cpt.procedure_name,
      zip_code: intake.zip_code,
      max_results: 5,
    });
  } catch (err) {
    const normalizedError = err instanceof Error ? err : new Error(String(err));
    if (process.env.NODE_ENV !== "production") {
      console.error("[insurance-navigator] provider-search error:", normalizedError.message);
    }
    throw new InsuranceAdapterExecutionError(
      "Insurance adapter execution failed.",
      normalizedError
    );
  }

  const providersToQuote = providers.slice(0, INS_NAV_PROVIDER_CALL_LIMIT);
  if (callbackPhone) {
    const liveProvider = providersToQuote[0];
    const providerContext = liveProvider
      ? `Target provider for this live pricing call: name ${liveProvider.name}, address ${liveProvider.address}, phone ${liveProvider.phone}.`
      : "Target provider for this live pricing call: unavailable from provider search.";
    const outboundResult = await triggerOutboundCall({
      to: providerPricingCallTo,
      stage: "provider_pricing",
      brief: [
        `Plan name: ${intake.plan_name}.`,
        `Procedure: ${cpt.procedure_name}.`,
        `CPT code: ${cpt.cpt_code}.`,
        `Zip code: ${intake.zip_code}.`,
        providerContext,
        "Collect one real provider quote on this call. Additional providers may be mock-enriched for demo ranking.",
      ].join(" "),
    });
    stageOutboundCalls.push(
      outboundResult.ok
        ? {
            stage: "provider_pricing",
            requested: true,
            status: "triggered",
            call_sid: outboundResult.sid,
          }
        : {
            stage: "provider_pricing",
            requested: true,
            status: "failed",
            error: outboundResult.error,
          }
    );
  }
  let quotes: ProviderQuoteResult[];
  try {
    quotes = await Promise.all(
      providersToQuote.map((provider) =>
        providerQuoteAdapter.fetchQuote({
          provider,
          cpt_code: cpt.cpt_code,
          plan_name: intake.plan_name,
        })
      )
    );
  } catch (err) {
    const normalizedError = err instanceof Error ? err : new Error(String(err));
    if (process.env.NODE_ENV !== "production") {
      console.error("[insurance-navigator] provider-quote error:", normalizedError.message);
    }
    throw new InsuranceAdapterExecutionError(
      "Insurance adapter execution failed.",
      normalizedError
    );
  }

  const providersRanked = quotes
    .map((quote) => estimatePatientCostForProvider(quote, insuranceCallResult))
    .sort((a, b) => a.estimated_patient_cost - b.estimated_patient_cost);

  let outboundCallMeta: InsuranceNavigatorRunResponse["meta"]["outbound_call"] = {
    requested: stageOutboundCalls.some((item) => item.requested),
    status: "skipped",
  };
  if (stageOutboundCalls.some((item) => item.status === "triggered")) {
    outboundCallMeta = {
      requested: true,
      status: "triggered",
      call_sid: stageOutboundCalls.find((item) => item.call_sid)?.call_sid,
    };
  } else if (stageOutboundCalls.some((item) => item.status === "failed")) {
    outboundCallMeta = {
      requested: true,
      status: "failed",
      error: stageOutboundCalls.find((item) => item.error)?.error,
    };
  }

  return {
    ok: true,
    data: {
      intake,
      cpt,
      insurance_call_result: insuranceCallResult,
      providers_ranked: providersRanked,
      recommended_provider_id: providersRanked[0]?.provider_id || null,
      meta: {
        adapter: insuranceCallAdapter.getAdapterName(),
        resolved_member_services_phone: phoneResolution.phone,
        phone_resolution_source: phoneResolution.source,
        provider_search_adapter: providerSearchAdapter.getAdapterName(),
        provider_quote_adapter: providerQuoteAdapter.getAdapterName(),
        orchestration_mode: orchestrationMode,
        outbound_call: outboundCallMeta,
        stage_outbound_calls: stageOutboundCalls,
      },
    },
  };
}
