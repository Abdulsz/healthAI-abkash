import { ProviderSearchResult } from "../domain/contracts";

export type ProviderSearchInput = {
  procedure_name: string;
  zip_code: string;
  max_results: number;
};

export interface ProviderSearchAdapter {
  getAdapterName(): string;
  searchProviders(input: ProviderSearchInput): Promise<ProviderSearchResult[]>;
}
