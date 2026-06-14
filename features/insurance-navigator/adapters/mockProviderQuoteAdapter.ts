import { ProviderQuoteAdapter, ProviderQuoteInput } from "./providerQuoteAdapter";
import { ProviderQuoteResult } from "../domain/contracts";

function numericSeed(value: string): number {
  return Array.from(value).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export class MockProviderQuoteAdapter implements ProviderQuoteAdapter {
  getAdapterName(): string {
    return "mock";
  }

  async fetchQuote(input: ProviderQuoteInput): Promise<ProviderQuoteResult> {
    const seed = numericSeed(
      `${input.provider.provider_id}:${input.cpt_code}:${input.plan_name.toLowerCase()}`
    );
    const procedurePrice = 500 + (seed % 9) * 125;

    return {
      provider_id: input.provider.provider_id,
      provider_name: input.provider.name,
      address: input.provider.address,
      phone: input.provider.phone,
      procedure_price: procedurePrice,
      accepts_insurance: true,
    };
  }
}
