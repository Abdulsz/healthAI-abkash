import { ProviderQuoteResult, ProviderSearchResult } from "../domain/contracts";

export type ProviderQuoteInput = {
  provider: ProviderSearchResult;
  cpt_code: string;
  plan_name: string;
};

export interface ProviderQuoteAdapter {
  getAdapterName(): string;
  fetchQuote(input: ProviderQuoteInput): Promise<ProviderQuoteResult>;
}
