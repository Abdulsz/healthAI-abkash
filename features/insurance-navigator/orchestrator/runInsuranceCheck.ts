import {
  DEFAULT_INSURANCE_ADAPTER,
  INSURANCE_ADAPTER_ENV_KEY,
} from "../config/constants";
import {
  InsuranceNavigatorCheckResponse,
  ValidationErrorResponse,
} from "../domain/contracts";
import { validateInsuranceNavigatorIntake } from "../domain/validation";
import { mapProcedureToCpt } from "../adapters/cptMapper";
import { resolveInsuranceMemberServicesPhone } from "../adapters/insuranceLookup";
import { InsuranceCallAdapter } from "../adapters/insuranceCallAdapter";
import { MockInsuranceCallAdapter } from "../adapters/mockInsuranceCallAdapter";
import { GrokInsuranceCallAdapter } from "../adapters/grokInsuranceCallAdapter";

type OrchestratorResult =
  | { ok: true; data: InsuranceNavigatorCheckResponse }
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

export async function runInsuranceCheck(body: unknown): Promise<OrchestratorResult> {
  const validated = validateInsuranceNavigatorIntake(body);
  if (!validated.ok) {
    return validated;
  }

  const intake = validated.data;
  const cpt = mapProcedureToCpt(intake.procedure_description);
  const phoneResolution = resolveInsuranceMemberServicesPhone({
    planName: intake.plan_name,
    phoneOverride: intake.member_services_phone_override,
  });

  const adapter = buildInsuranceCallAdapter();
  const insuranceCallResult = await adapter.checkCoverage({
    plan_name: intake.plan_name,
    member_id: intake.member_id,
    group_number: intake.group_number,
    cpt_code: cpt.cpt_code,
    procedure_name: cpt.procedure_name,
    member_services_phone: phoneResolution.phone,
  });

  return {
    ok: true,
    data: {
      intake,
      cpt,
      insurance_call_result: insuranceCallResult,
      meta: {
        adapter: adapter.getAdapterName(),
        resolved_member_services_phone: phoneResolution.phone,
        phone_resolution_source: phoneResolution.source,
      },
    },
  };
}
