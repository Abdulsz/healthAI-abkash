/** @vitest-environment jsdom */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InsuranceNavigatorPage from "../../app/insurance-navigator/page";

function buildJsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

describe("InsuranceNavigatorPage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders success sections after a valid API response", async () => {
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse(
        {
          cpt: { cpt_code: "73721", procedure_name: "MRI lower extremity joint" },
          insurance_call_result: {
            covered: true,
            deductible_total: 1500,
            deductible_met: 800,
            deductible_remaining: 700,
            coinsurance_percentage: 20,
            facility_types_covered: ["imaging center"],
          },
          meta: {
            adapter: "mock",
            resolved_member_services_phone: "2298293537",
            phone_resolution_source: "static_lookup",
          },
        },
        200
      )
    );

    const user = userEvent.setup();
    render(<InsuranceNavigatorPage />);

    await user.type(screen.getByLabelText("Plan Name"), "Blue Cross PPO");
    await user.type(screen.getByLabelText("Member ID"), "MEM001");
    await user.type(screen.getByLabelText("Group Number"), "GRP001");
    await user.type(screen.getByLabelText("Procedure Description"), "knee MRI");
    await user.type(screen.getByLabelText("Zip Code"), "94103");
    await user.click(screen.getByRole("button", { name: "Run Insurance Check" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Coverage Snapshot")).toBeTruthy();
    expect(screen.getByText("73721 - MRI lower extremity joint")).toBeTruthy();
    expect(screen.getByText("mock / static_lookup")).toBeTruthy();
  });

  it("shows inline validation issues for 400 validation_error responses", async () => {
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse(
        {
          error: "validation_error",
          issues: [{ field: "plan_name", message: "field is required" }],
        },
        400
      )
    );

    const user = userEvent.setup();
    render(<InsuranceNavigatorPage />);
    await user.click(screen.getByRole("button", { name: "Run Insurance Check" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("field is required")).toBeTruthy();
  });

  it("shows service error banner for non-400 failures", async () => {
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse(
        {
          error: "service_error",
          code: "internal_error",
          message: "Internal insurance service error.",
        },
        500
      )
    );

    const user = userEvent.setup();
    render(<InsuranceNavigatorPage />);
    await user.click(screen.getByRole("button", { name: "Run Insurance Check" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("We could not complete the insurance check right now. Please try again.")
    ).toBeTruthy();
  });

  it("shows service error banner for 503 adapter failures", async () => {
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse(
        {
          error: "service_error",
          code: "adapter_execution_failed",
          message: "Insurance adapter execution failed.",
        },
        503
      )
    );

    const user = userEvent.setup();
    render(<InsuranceNavigatorPage />);
    await user.click(screen.getByRole("button", { name: "Run Insurance Check" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("We could not complete the insurance check right now. Please try again.")
    ).toBeTruthy();
  });
});
