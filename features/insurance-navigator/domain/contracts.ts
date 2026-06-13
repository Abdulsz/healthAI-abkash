export type InsuranceNavigatorIntakeRequest = {
  plan_name: string;
  member_id: string;
  group_number: string;
  procedure_description: string;
  zip_code: string;
  member_services_phone_override?: string;
};

export type InsuranceNavigatorIntake = {
  plan_name: string;
  member_id: string;
  group_number: string;
  procedure_description: string;
  zip_code: string;
  member_services_phone_override?: string;
};

export type ValidationIssue = {
  field: keyof InsuranceNavigatorIntakeRequest;
  message: string;
};

export type ValidationErrorResponse = {
  error: "validation_error";
  issues: ValidationIssue[];
};

export type CptMappingResult = {
  cpt_code: string;
  procedure_name: string;
};

export type InsuranceCallResult = {
  covered: boolean;
  deductible_total: number;
  deductible_met: number;
  deductible_remaining: number;
  coinsurance_percentage: number;
  facility_types_covered: string[];
};

export type InsuranceCallInput = {
  plan_name: string;
  member_id: string;
  group_number: string;
  cpt_code: string;
  procedure_name: string;
  member_services_phone: string;
};

export type InsurancePhoneResolutionSource =
  | "manual_override"
  | "static_lookup"
  | "default_fallback";

export type InsurancePhoneResolution = {
  phone: string;
  source: InsurancePhoneResolutionSource;
};

export type InsuranceNavigatorCheckResponse = {
  intake: InsuranceNavigatorIntake;
  cpt: CptMappingResult;
  insurance_call_result: InsuranceCallResult;
  meta: {
    adapter: string;
    resolved_member_services_phone: string;
    phone_resolution_source: InsurancePhoneResolutionSource;
  };
};
