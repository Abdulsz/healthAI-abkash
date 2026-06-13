import { InsuranceCallAdapter } from "./insuranceCallAdapter";
import { InsuranceCallInput, InsuranceCallResult } from "../domain/contracts";

export class GrokInsuranceCallAdapter implements InsuranceCallAdapter {
  getAdapterName(): string {
    return "grok";
  }

  async checkCoverage(_input: InsuranceCallInput): Promise<InsuranceCallResult> {
    throw new Error(
      "GrokInsuranceCallAdapter is not implemented in Slice 1. Set INS_NAV_INSURANCE_ADAPTER=mock."
    );
  }
}
