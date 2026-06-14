import { describe, expect, it } from "vitest";
import { POST } from "../../app/api/insurance-navigator/check/route";

describe("POST /api/insurance-navigator/check", () => {
  it("returns the Slice 1 response shape for valid request payload", async () => {
    const req = new Request("http://localhost/api/insurance-navigator/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan_name: "Blue Cross PPO",
        member_id: "MEM001",
        group_number: "GRP001",
        procedure_description: "My doctor said I need a knee MRI",
        zip_code: "94103",
      }),
    });

    const response = await POST(req);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(payload.intake).toMatchObject({
      plan_name: "Blue Cross PPO",
      member_id: "MEM001",
      group_number: "GRP001",
      zip_code: "94103",
    });
    expect(payload.cpt).toMatchObject({
      cpt_code: expect.any(String),
      procedure_name: expect.any(String),
    });
    expect(payload.insurance_call_result).toMatchObject({
      covered: expect.any(Boolean),
      deductible_total: expect.any(Number),
      deductible_met: expect.any(Number),
      deductible_remaining: expect.any(Number),
      coinsurance_percentage: expect.any(Number),
      facility_types_covered: expect.any(Array),
    });
    expect(payload.meta).toEqual({
      adapter: "mock",
      resolved_member_services_phone: "2298293537",
      phone_resolution_source: "static_lookup",
    });
  });
});
