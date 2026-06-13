import { DEMO_FALLBACK_PHONE_NUMBER, INSURER_LOOKUP } from "../config/constants";
import { InsurancePhoneResolution } from "../domain/contracts";

type ResolveInsurancePhoneInput = {
  planName: string;
  phoneOverride?: string;
};

export function resolveInsuranceMemberServicesPhone(
  input: ResolveInsurancePhoneInput
): InsurancePhoneResolution {
  const normalizedOverride = (input.phoneOverride || "").trim();
  if (normalizedOverride) {
    return {
      phone: normalizedOverride,
      source: "manual_override",
    };
  }

  const normalizedPlanName = input.planName.trim().toLowerCase();
  if (!normalizedPlanName) {
    return {
      phone: DEMO_FALLBACK_PHONE_NUMBER,
      source: "default_fallback",
    };
  }

  const matchKey = Object.keys(INSURER_LOOKUP).find((key) =>
    normalizedPlanName.includes(key)
  );

  if (matchKey) {
    return {
      phone: INSURER_LOOKUP[matchKey],
      source: "static_lookup",
    };
  }

  return {
    phone: DEMO_FALLBACK_PHONE_NUMBER,
    source: "default_fallback",
  };
}
