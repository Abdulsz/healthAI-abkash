import { RankedProviderResult, ProviderQuoteResult, InsuranceCallResult } from "./contracts";

export function estimatePatientCostForProvider(
  quote: ProviderQuoteResult,
  coverage: InsuranceCallResult
): RankedProviderResult {
  const remainingDeductible = Math.max(0, coverage.deductible_total - coverage.deductible_met);
  let estimatedPatientCost = quote.procedure_price;

  if (quote.procedure_price > remainingDeductible) {
    const afterDeductible = quote.procedure_price - remainingDeductible;
    estimatedPatientCost =
      remainingDeductible + afterDeductible * (coverage.coinsurance_percentage / 100);
  }

  return {
    ...quote,
    estimated_patient_cost: Math.round(estimatedPatientCost),
  };
}
