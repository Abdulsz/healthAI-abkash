import { InsuranceCallInput, InsuranceCallResult } from "../domain/contracts";

export interface InsuranceCallAdapter {
  getAdapterName(): string;
  checkCoverage(input: InsuranceCallInput): Promise<InsuranceCallResult>;
}
