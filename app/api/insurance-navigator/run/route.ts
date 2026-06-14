import { NextResponse } from "next/server";
import { runInsuranceNavigatorSession } from "@/features/insurance-navigator/orchestrator/runInsuranceNavigatorSession";
import { InsuranceAdapterExecutionError } from "@/features/insurance-navigator/domain/errors";
import { ServiceErrorResponse } from "@/features/insurance-navigator/domain/contracts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await runInsuranceNavigatorSession(body);
    if (!result.ok) {
      return NextResponse.json(result.error, {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    return NextResponse.json(result.data, { headers: JSON_HEADERS });
  } catch (err) {
    if (err instanceof InsuranceAdapterExecutionError) {
      const errorBody: ServiceErrorResponse = {
        error: "service_error",
        code: "adapter_execution_failed",
        message: "Insurance adapter execution failed.",
      };
      return NextResponse.json(errorBody, { status: 503, headers: JSON_HEADERS });
    }

    const errorBody: ServiceErrorResponse = {
      error: "service_error",
      code: "internal_error",
      message: "Internal insurance service error.",
    };
    return NextResponse.json(errorBody, { status: 500, headers: JSON_HEADERS });
  }
}
