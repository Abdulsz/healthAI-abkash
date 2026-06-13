import { describe, expect, it } from "vitest";
import { validateInsuranceNavigatorIntake } from "../../features/insurance-navigator/domain/validation";

describe("validateInsuranceNavigatorIntake", () => {
  it("returns deterministic field errors for missing required fields", () => {
    const result = validateInsuranceNavigatorIntake({});

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected validation failure");
    }

    expect(result.error).toEqual({
      error: "validation_error",
      issues: [
        { field: "plan_name", message: "field is required" },
        { field: "member_id", message: "field is required" },
        { field: "group_number", message: "field is required" },
        { field: "procedure_description", message: "field is required" },
        { field: "zip_code", message: "field is required" },
      ],
    });
  });

  it("returns zip validation error for malformed zip code", () => {
    const result = validateInsuranceNavigatorIntake({
      plan_name: "Blue Cross PPO",
      member_id: "M1",
      group_number: "G1",
      procedure_description: "knee MRI",
      zip_code: "9410A",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected validation failure");
    }

    expect(result.error.issues).toContainEqual({
      field: "zip_code",
      message: "must be a valid 5-digit zip code",
    });
  });
});
