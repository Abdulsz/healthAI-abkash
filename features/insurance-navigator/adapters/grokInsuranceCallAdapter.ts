import { InsuranceCallAdapter } from "./insuranceCallAdapter";
import { InsuranceCallInput, InsuranceCallResult } from "../domain/contracts";
import { runGrokVoiceJsonTurn, runGrokVoiceTextTurn } from "./grokVoiceSession";

function parseNumber(raw: string): number {
  const normalized = raw.replace(/[$,%\s]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : NaN;
}

const FACILITY_FIELD_NOISE = /\b(covered|deductible|coinsurance|facility[_\s]?types?)\b/i;

export function parseFacilityTypes(raw: string): string[] {
  // The model sometimes appends a JSON-ish object dump on the same line, e.g.
  // "[imaging center, hospital outpatient]] {covered:true, deductible_total:1500, ...}".
  // Cut everything from the first object/array close or other structured field so we
  // only keep the actual facility list.
  let value = raw.trim();
  const cutAt = value.search(/[}{]/);
  if (cutAt !== -1) {
    value = value.slice(0, cutAt);
  }

  return value
    .replace(/[\[\]"']/g, "")
    .split(/,| and /i)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.includes(":") && !FACILITY_FIELD_NOISE.test(entry));
}

function parseInsuranceCallFromText(raw: string): InsuranceCallResult {
  const coveredMatch = raw.match(
    /(?:covered|coverage)\s*[:=-]?\s*(true|false|yes|no|covered|not covered)/i
  );
  const deductibleTotalMatch = raw.match(
    /(?:deductible[_\s]?total|total deductible)\D{0,20}([0-9][0-9,\.]*)/i
  );
  const deductibleMetMatch = raw.match(
    /(?:deductible[_\s]?met|met deductible)\D{0,20}([0-9][0-9,\.]*)/i
  );
  const coinsuranceMatch = raw.match(
    /(?:coinsurance(?:[_\s]?percentage)?)\D{0,20}([0-9][0-9,\.]*)/i
  );
  const facilitiesMatch = raw.match(
    /(?:facility[_\s]?types[_\s]?covered|facility types covered|facility types)\s*[:=-]\s*([^\n]+)/i
  );

  const deductibleTotal = parseNumber(deductibleTotalMatch?.[1] || "");
  const deductibleMet = parseNumber(deductibleMetMatch?.[1] || "");
  const coinsurance = parseNumber(coinsuranceMatch?.[1] || "");
  const coveredRaw = (coveredMatch?.[1] || "").toLowerCase();

  if (!Number.isFinite(deductibleTotal) || !Number.isFinite(deductibleMet)) {
    throw new Error("Grok response missing deductible numbers.");
  }

  return {
    covered: ["true", "yes", "covered"].includes(coveredRaw),
    deductible_total: Math.max(0, Math.round(deductibleTotal)),
    deductible_met: Math.max(0, Math.round(deductibleMet)),
    deductible_remaining: Math.max(0, Math.round(deductibleTotal - deductibleMet)),
    coinsurance_percentage: Number.isFinite(coinsurance) ? Math.max(0, Math.round(coinsurance)) : 0,
    facility_types_covered: parseFacilityTypes(facilitiesMatch?.[1] || ""),
  };
}

export class GrokInsuranceCallAdapter implements InsuranceCallAdapter {
  getAdapterName(): string {
    return "grok";
  }

  async checkCoverage(input: InsuranceCallInput): Promise<InsuranceCallResult> {
    const prompt = [
      `Plan name: ${input.plan_name}`,
      `Member ID: ${input.member_id}`,
      `Group number: ${input.group_number}`,
      `Member services phone: ${input.member_services_phone}`,
      `Procedure name: ${input.procedure_name}`,
      `CPT code: ${input.cpt_code}`,
      "Questions to resolve:",
      `1) Is CPT ${input.cpt_code} covered?`,
      "2) What is deductible_total and deductible_met?",
      "3) What is coinsurance_percentage?",
      "4) What facility types are covered?",
      "Return exactly this JSON schema:",
      '{"covered":boolean,"deductible_total":number,"deductible_met":number,"deductible_remaining":number,"coinsurance_percentage":number,"facility_types_covered":string[]}',
    ].join("\n");

    try {
      const result = await runGrokVoiceJsonTurn<Partial<InsuranceCallResult>>({
        instructions: [
          "You are an insurance verification voice agent.",
          "Simulate calling member services and extracting a precise structured response.",
          "Return valid JSON only.",
        ].join(" "),
        prompt,
      });

      const deductibleTotal = Number(result.deductible_total);
      const deductibleMet = Number(result.deductible_met);
      const deductibleRemaining =
        result.deductible_remaining == null
          ? Math.max(0, deductibleTotal - deductibleMet)
          : Number(result.deductible_remaining);
      const coinsurance = Number(result.coinsurance_percentage);

      if (!Number.isFinite(deductibleTotal) || !Number.isFinite(deductibleMet)) {
        throw new Error("Invalid Grok insurance response.");
      }

      return {
        covered: Boolean(result.covered),
        deductible_total: Math.max(0, Math.round(deductibleTotal)),
        deductible_met: Math.max(0, Math.round(deductibleMet)),
        deductible_remaining: Math.max(0, Math.round(deductibleRemaining)),
        coinsurance_percentage: Number.isFinite(coinsurance)
          ? Math.max(0, Math.round(coinsurance))
          : 0,
        facility_types_covered: Array.isArray(result.facility_types_covered)
          ? result.facility_types_covered.flatMap((value) => parseFacilityTypes(String(value)))
          : ["hospital outpatient", "imaging center"],
      };
    } catch {
      const fallbackText = await runGrokVoiceTextTurn({
        instructions: [
          "You are an insurance verification voice agent.",
          "Use concise field-by-field output.",
          "Output lines like: covered: yes, deductible_total: 1500, deductible_met: 800, coinsurance_percentage: 20, facility_types_covered: imaging center, hospital outpatient",
        ].join(" "),
        prompt,
      });
      return parseInsuranceCallFromText(fallbackText);
    }
  }
}
