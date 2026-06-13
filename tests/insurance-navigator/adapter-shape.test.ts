import { describe, expect, it } from "vitest";
import { MockInsuranceCallAdapter } from "../../features/insurance-navigator/adapters/mockInsuranceCallAdapter";

describe("MockInsuranceCallAdapter", () => {
  it("returns structured insurance-call response shape", async () => {
    const adapter = new MockInsuranceCallAdapter();
    const result = await adapter.checkCoverage({
      plan_name: "Blue Cross PPO",
      member_id: "MEM12345",
      group_number: "GRP10",
      cpt_code: "73721",
      procedure_name: "MRI lower extremity joint",
      member_services_phone: "2298293537",
    });

    expect(typeof result.covered).toBe("boolean");
    expect(typeof result.deductible_total).toBe("number");
    expect(typeof result.deductible_met).toBe("number");
    expect(typeof result.deductible_remaining).toBe("number");
    expect(typeof result.coinsurance_percentage).toBe("number");
    expect(Array.isArray(result.facility_types_covered)).toBe(true);
    expect(result.facility_types_covered.length).toBeGreaterThan(0);
  });
});
