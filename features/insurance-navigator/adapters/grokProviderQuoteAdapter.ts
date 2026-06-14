import { ProviderQuoteResult } from "../domain/contracts";
import { runGrokVoiceJsonTurn, runGrokVoiceTextTurn } from "./grokVoiceSession";
import { ProviderQuoteAdapter, ProviderQuoteInput } from "./providerQuoteAdapter";

function parseQuoteFromText(raw: string): { procedure_price: number; accepts_insurance: boolean } {
  const priceMatch = raw.match(
    /(?:procedure[_\s]?price|cash price|self-pay price|price)\D{0,20}([0-9][0-9,\.]*)/i
  );
  const acceptsMatch = raw.match(
    /(?:accepts[_\s]?insurance|accepts insurance)\s*[:=-]?\s*(true|false|yes|no)/i
  );

  const numeric = Number((priceMatch?.[1] || "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Grok provider quote missing valid price.");
  }

  const acceptsRaw = (acceptsMatch?.[1] || "yes").toLowerCase();
  return {
    procedure_price: Math.round(numeric),
    accepts_insurance: !["false", "no"].includes(acceptsRaw),
  };
}

export class GrokProviderQuoteAdapter implements ProviderQuoteAdapter {
  getAdapterName(): string {
    return "grok";
  }

  async fetchQuote(input: ProviderQuoteInput): Promise<ProviderQuoteResult> {
    const prompt = [
      `Provider: ${input.provider.name}`,
      `Address: ${input.provider.address}`,
      `Phone: ${input.provider.phone}`,
      `Plan: ${input.plan_name}`,
      `CPT: ${input.cpt_code}`,
      "Ask for cash price/self-pay and if they accept the insurance plan.",
      'Return JSON schema: {"procedure_price":number,"accepts_insurance":boolean}',
    ].join("\n");

    let parsedPrice: number;
    let acceptsInsurance: boolean;

    try {
      const response = await runGrokVoiceJsonTurn<{
        procedure_price?: number;
        accepts_insurance?: boolean;
      }>({
        instructions: [
          "You are a provider pricing voice agent.",
          "Simulate calling the provider front desk and gather quote details.",
          "Return valid JSON only.",
        ].join(" "),
        prompt,
      });
      parsedPrice = Number(response.procedure_price);
      acceptsInsurance = response.accepts_insurance !== false;
    } catch {
      const fallbackText = await runGrokVoiceTextTurn({
        instructions: [
          "You are a provider pricing voice agent.",
          "Output plain lines only, for example:",
          "procedure_price: 850",
          "accepts_insurance: yes",
        ].join(" "),
        prompt,
      });
      const parsed = parseQuoteFromText(fallbackText);
      parsedPrice = parsed.procedure_price;
      acceptsInsurance = parsed.accepts_insurance;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new Error("Invalid Grok provider quote response.");
    }

    return {
      provider_id: input.provider.provider_id,
      provider_name: input.provider.name,
      address: input.provider.address,
      phone: input.provider.phone,
      procedure_price: Math.round(parsedPrice),
      accepts_insurance: acceptsInsurance,
    };
  }
}
