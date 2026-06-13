import { describe, expect, it } from "vitest";
import { DEMO_FALLBACK_PHONE_NUMBER } from "../../features/insurance-navigator/config/constants";
import { resolveInsuranceMemberServicesPhone } from "../../features/insurance-navigator/adapters/insuranceLookup";

describe("resolveInsuranceMemberServicesPhone", () => {
  it("prefers explicit manual override", () => {
    const result = resolveInsuranceMemberServicesPhone({
      planName: "Unknown Health Plan",
      phoneOverride: "8887776666",
    });

    expect(result).toEqual({
      phone: "8887776666",
      source: "manual_override",
    });
  });

  it("falls back to demo number when no lookup match exists", () => {
    const result = resolveInsuranceMemberServicesPhone({
      planName: "Completely New Insurance",
    });

    expect(result).toEqual({
      phone: DEMO_FALLBACK_PHONE_NUMBER,
      source: "default_fallback",
    });
  });
});
