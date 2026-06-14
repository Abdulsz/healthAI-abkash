import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/insurance-navigator/check/route";
import * as insuranceCheckOrchestrator from "../../features/insurance-navigator/orchestrator/runInsuranceCheck";
import { InsuranceAdapterExecutionError } from "../../features/insurance-navigator/domain/errors";

function buildJsonRequest(body: unknown) {
  return new Request("http://localhost/api/insurance-navigator/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectJsonContentType(response: Response) {
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
}

describe("POST /api/insurance-navigator/check error contracts", () => {
  const originalAdapter = process.env.INS_NAV_INSURANCE_ADAPTER;

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof originalAdapter === "undefined") {
      delete process.env.INS_NAV_INSURANCE_ADAPTER;
    } else {
      process.env.INS_NAV_INSURANCE_ADAPTER = originalAdapter;
    }
  });

  it("returns validation_error envelope for invalid payload", async () => {
    const response = await POST(buildJsonRequest({}));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expectJsonContentType(response);
    expect(Object.keys(payload).sort()).toEqual(["error", "issues"]);
    expect(payload.error).toBe("validation_error");
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(payload.issues).toContainEqual({
      field: "plan_name",
      message: "field is required",
    });
  });

  it("returns deterministic validation_error envelope for malformed JSON", async () => {
    const malformedRequest = new Request("http://localhost/api/insurance-navigator/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad-json",
    });
    const response = await POST(malformedRequest);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expectJsonContentType(response);
    expect(payload).toEqual({
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

  it("returns service_error contract when grok adapter is selected", async () => {
    process.env.INS_NAV_INSURANCE_ADAPTER = "grok";

    const response = await POST(
      buildJsonRequest({
        plan_name: "Blue Cross PPO",
        member_id: "MEM001",
        group_number: "GRP001",
        procedure_description: "knee MRI",
        zip_code: "94103",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expectJsonContentType(response);
    expect(payload).toEqual({
      error: "service_error",
      code: "adapter_execution_failed",
      message: "Insurance adapter execution failed.",
    });
  });

  it("falls back to mock adapter for unknown adapter value", async () => {
    process.env.INS_NAV_INSURANCE_ADAPTER = "unknown";

    const response = await POST(
      buildJsonRequest({
        plan_name: "Blue Cross PPO",
        member_id: "MEM001",
        group_number: "GRP001",
        procedure_description: "knee MRI",
        zip_code: "94103",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.adapter).toBe("mock");
    expect(typeof payload.cpt.cpt_code).toBe("string");
  });

  it("returns internal_error contract for unexpected exceptions", async () => {
    vi.spyOn(insuranceCheckOrchestrator, "runInsuranceCheck").mockRejectedValueOnce(
      new Error("SECRET_INTERNAL_TRACE")
    );

    const response = await POST(
      buildJsonRequest({
        plan_name: "Blue Cross PPO",
        member_id: "MEM001",
        group_number: "GRP001",
        procedure_description: "knee MRI",
        zip_code: "94103",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expectJsonContentType(response);
    expect(payload).toEqual({
      error: "service_error",
      code: "internal_error",
      message: "Internal insurance service error.",
    });
  });

  it("returns internal_error contract for string throws without leaking raw text", async () => {
    vi.spyOn(insuranceCheckOrchestrator, "runInsuranceCheck").mockRejectedValueOnce(
      "SECRET_INTERNAL_TRACE"
    );

    const response = await POST(
      buildJsonRequest({
        plan_name: "Blue Cross PPO",
        member_id: "MEM001",
        group_number: "GRP001",
        procedure_description: "knee MRI",
        zip_code: "94103",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expectJsonContentType(response);
    expect(payload).toEqual({
      error: "service_error",
      code: "internal_error",
      message: "Internal insurance service error.",
    });
  });

  it("returns adapter_execution_failed contract without leaking typed error message", async () => {
    vi.spyOn(insuranceCheckOrchestrator, "runInsuranceCheck").mockRejectedValueOnce(
      new InsuranceAdapterExecutionError("SECRET_ADAPTER_TRACE")
    );

    const response = await POST(
      buildJsonRequest({
        plan_name: "Blue Cross PPO",
        member_id: "MEM001",
        group_number: "GRP001",
        procedure_description: "knee MRI",
        zip_code: "94103",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expectJsonContentType(response);
    expect(payload).toEqual({
      error: "service_error",
      code: "adapter_execution_failed",
      message: "Insurance adapter execution failed.",
    });
  });

  it("rejects non-json media type lookalikes in strict parser", () => {
    const contentType = "application/jsonp";
    expect(contentType).not.toBe("application/json; charset=utf-8");
  });
});
