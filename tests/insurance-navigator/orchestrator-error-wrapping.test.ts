import { afterEach, describe, expect, it, vi } from "vitest";
import { InsuranceAdapterExecutionError } from "../../features/insurance-navigator/domain/errors";

const VALID_REQUEST = {
  plan_name: "Blue Cross PPO",
  member_id: "MEM001",
  group_number: "GRP001",
  procedure_description: "knee MRI",
  zip_code: "94103",
};

const originalAdapter = process.env.INS_NAV_INSURANCE_ADAPTER;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unmock("../../features/insurance-navigator/adapters/mockInsuranceCallAdapter");
  vi.unmock("../../features/insurance-navigator/adapters/grokInsuranceCallAdapter");
  if (typeof originalAdapter === "undefined") {
    delete process.env.INS_NAV_INSURANCE_ADAPTER;
  } else {
    process.env.INS_NAV_INSURANCE_ADAPTER = originalAdapter;
  }
});

describe("runInsuranceCheck error wrapping", () => {
  it("wraps adapter failures as InsuranceAdapterExecutionError", async () => {
    process.env.INS_NAV_INSURANCE_ADAPTER = "grok";
    const { runInsuranceCheck } = await import(
      "../../features/insurance-navigator/orchestrator/runInsuranceCheck"
    );

    await expect(runInsuranceCheck(VALID_REQUEST)).rejects.toBeInstanceOf(
      InsuranceAdapterExecutionError
    );
  });

  it("preserves the original adapter failure as cause", async () => {
    process.env.INS_NAV_INSURANCE_ADAPTER = "grok";
    const { runInsuranceCheck } = await import(
      "../../features/insurance-navigator/orchestrator/runInsuranceCheck"
    );

    let caught: unknown;
    try {
      await runInsuranceCheck(VALID_REQUEST);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const wrapped = caught as Error & { cause?: Error };
    expect(wrapped.name).toBe("InsuranceAdapterExecutionError");
    expect(wrapped.message).toBe("Insurance adapter execution failed.");
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect(wrapped.cause?.message).toMatch(/Missing xAI key|not implemented/);
  });

  it("does not wrap non-adapter failures at orchestrator boundary", async () => {
    const cptMapper = await import("../../features/insurance-navigator/adapters/cptMapper");
    vi.spyOn(cptMapper, "mapProcedureToCpt").mockImplementation(() => {
      throw new Error("cpt mapper boom");
    });

    const { runInsuranceCheck } = await import(
      "../../features/insurance-navigator/orchestrator/runInsuranceCheck"
    );

    let caught: unknown;
    try {
      await runInsuranceCheck(VALID_REQUEST);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(InsuranceAdapterExecutionError);
    expect((caught as Error).message).toBe("cpt mapper boom");
  });

  it("normalizes non-Error adapter throws into Error cause", async () => {
    process.env.INS_NAV_INSURANCE_ADAPTER = "mock";

    vi.doMock("../../features/insurance-navigator/adapters/mockInsuranceCallAdapter", () => ({
      MockInsuranceCallAdapter: class {
        getAdapterName(): string {
          return "mock";
        }
        async checkCoverage(): Promise<never> {
          throw "adapter non-error boom";
        }
      },
    }));

    const { runInsuranceCheck } = await import(
      "../../features/insurance-navigator/orchestrator/runInsuranceCheck"
    );

    let caught: unknown;
    try {
      await runInsuranceCheck(VALID_REQUEST);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const wrapped = caught as Error & { cause?: Error };
    expect(wrapped.name).toBe("InsuranceAdapterExecutionError");
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect(wrapped.cause?.message).toContain("adapter non-error boom");
  });
});
