import { DEMO_FALLBACK_PHONE_NUMBER } from "../config/constants";
import { ProviderSearchResult } from "../domain/contracts";
import { ProviderSearchAdapter, ProviderSearchInput } from "./providerSearchAdapter";

const MOCK_PROVIDER_NAMES = [
  "Summit Imaging Center",
  "Westview Medical Diagnostics",
  "Riverside Specialty Clinic",
  "Northgate Outpatient Center",
  "Cedar Valley Care Partners",
];

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export class MockProviderSearchAdapter implements ProviderSearchAdapter {
  getAdapterName(): string {
    return "mock";
  }

  async searchProviders(input: ProviderSearchInput): Promise<ProviderSearchResult[]> {
    const seed = sanitize(`${input.procedure_name}-${input.zip_code}`);
    const count = Math.max(1, Math.min(input.max_results, MOCK_PROVIDER_NAMES.length));

    return Array.from({ length: count }).map((_, index) => {
      const providerNumber = index + 1;
      const providerId = `provider_${seed}_${providerNumber}`;
      return {
        provider_id: providerId,
        name: MOCK_PROVIDER_NAMES[index],
        address: `${120 + index * 11} Main St, ${input.zip_code}`,
        phone: DEMO_FALLBACK_PHONE_NUMBER,
        place_id: `mock_place_${seed}_${providerNumber}`,
      };
    });
  }
}
