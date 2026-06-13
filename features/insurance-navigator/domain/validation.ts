import {
  InsuranceNavigatorIntake,
  InsuranceNavigatorIntakeRequest,
  ValidationErrorResponse,
  ValidationIssue,
} from "./contracts";

const REQUIRED_FIELDS: Array<keyof InsuranceNavigatorIntakeRequest> = [
  "plan_name",
  "member_id",
  "group_number",
  "procedure_description",
  "zip_code",
];

type ValidationResult =
  | { ok: true; data: InsuranceNavigatorIntake }
  | { ok: false; error: ValidationErrorResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateInsuranceNavigatorIntake(body: unknown): ValidationResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: {
        error: "validation_error",
        issues: REQUIRED_FIELDS.map((field) => ({
          field,
          message: "field is required",
        })),
      },
    };
  }

  const issues: ValidationIssue[] = [];

  for (const field of REQUIRED_FIELDS) {
    const normalized = normalizeString(body[field]);
    if (!normalized) {
      issues.push({ field, message: "field is required" });
    }
  }

  const zip = normalizeString(body.zip_code);
  if (zip && !/^\d{5}$/.test(zip)) {
    issues.push({ field: "zip_code", message: "must be a valid 5-digit zip code" });
  }

  const phoneOverride = normalizeString(body.member_services_phone_override);
  if (phoneOverride && !/^\d{10,15}$/.test(phoneOverride)) {
    issues.push({
      field: "member_services_phone_override",
      message: "must be 10 to 15 digits",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        error: "validation_error",
        issues,
      },
    };
  }

  return {
    ok: true,
    data: {
      plan_name: normalizeString(body.plan_name),
      member_id: normalizeString(body.member_id),
      group_number: normalizeString(body.group_number),
      procedure_description: normalizeString(body.procedure_description),
      zip_code: zip,
      member_services_phone_override: phoneOverride || undefined,
    },
  };
}
