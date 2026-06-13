import { InsuranceCallAdapter } from "./insuranceCallAdapter";
import { InsuranceCallInput, InsuranceCallResult } from "../domain/contracts";

function numericSeed(value: string): number {
  return Array.from(value).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export class MockInsuranceCallAdapter implements InsuranceCallAdapter {
  getAdapterName(): string {
    return "mock";
  }

  async checkCoverage(input: InsuranceCallInput): Promise<InsuranceCallResult> {
    const seed = numericSeed(
      `${input.member_id}:${input.group_number}:${input.cpt_code}:${input.member_services_phone}`
    );

    const deductibleTotal = 1500 + (seed % 4) * 250;
    const deductibleMet = Math.min(deductibleTotal, 300 + (seed % 7) * 150);
    const coinsurance = 10 + (seed % 4) * 5;

    return {
      covered: true,
      deductible_total: deductibleTotal,
      deductible_met: deductibleMet,
      deductible_remaining: deductibleTotal - deductibleMet,
      coinsurance_percentage: coinsurance,
      facility_types_covered: ["hospital outpatient", "imaging center", "urgent care"],
    };
  }
}
