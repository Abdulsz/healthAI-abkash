export type InsuranceNavigatorIntakeRequest = {
  plan_name: string;
  member_id: string;
  group_number: string;
  procedure_description: string;
  zip_code: string;
  member_services_phone_override?: string;
  callback_phone?: string;
};

export type InsuranceNavigatorIntake = {
  plan_name: string;
  member_id: string;
  group_number: string;
  procedure_description: string;
  zip_code: string;
  member_services_phone_override?: string;
  callback_phone?: string;
};

export type ValidationIssue = {
  field: keyof InsuranceNavigatorIntakeRequest;
  message: string;
};

export type ValidationErrorResponse = {
  error: "validation_error";
  issues: ValidationIssue[];
};

export type ServiceErrorResponse = {
  error: "service_error";
  code: "adapter_execution_failed" | "internal_error";
  message: string;
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

export type InsuranceCallResultSource = "ai_estimate" | "live_call";

export type LiveCallResultStatus = "pending" | "ready" | "failed" | "not_found";

export type LiveBookingResult = {
  confirmation_id: string;
  scheduled_for: string;
  booked: boolean;
};

export type LiveCallResultResponse = {
  call_sid: string;
  stage: string;
  status: LiveCallResultStatus;
  result?: InsuranceCallResult;
  booking?: LiveBookingResult;
  transcript?: string;
  error?: string;
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

export type ProviderSearchResult = {
  provider_id: string;
  name: string;
  address: string;
  phone: string;
  place_id?: string;
};

export type ProviderQuoteResult = {
  provider_id: string;
  provider_name: string;
  address: string;
  phone: string;
  procedure_price: number;
  accepts_insurance: boolean;
};

export type RankedProviderResult = ProviderQuoteResult & {
  estimated_patient_cost: number;
};

export type InsuranceNavigatorRunResponse = {
  intake: InsuranceNavigatorIntake;
  cpt: CptMappingResult;
  insurance_call_result: InsuranceCallResult;
  providers_ranked: RankedProviderResult[];
  recommended_provider_id: string | null;
  meta: {
    adapter: string;
    resolved_member_services_phone: string;
    phone_resolution_source: InsurancePhoneResolutionSource;
    provider_search_adapter: string;
    provider_quote_adapter: string;
    orchestration_mode: "pipeline" | "vercel_ai_sdk_agent_loop";
    outbound_call: {
      requested: boolean;
      status: "triggered" | "failed" | "skipped";
      call_sid?: string;
      error?: string;
    };
    stage_outbound_calls: Array<{
      stage: "insurance_verification" | "provider_pricing";
      requested: boolean;
      status: "triggered" | "failed" | "skipped";
      call_sid?: string;
      error?: string;
    }>;
  };
};

export type InsuranceNavigatorBookingRequest = {
  provider_id: string;
  provider_name: string;
  provider_phone: string;
  procedure_name: string;
  plan_name: string;
  member_id: string;
  group_number: string;
  preferred_dates: string[];
  callback_phone?: string;
};

export type InsuranceNavigatorBookingResponse = {
  confirmation_id: string;
  provider_name: string;
  scheduled_for: string;
  status: "booked";
  booking_phone: string;
  outbound_call?: {
    stage: "booking";
    requested: boolean;
    status: "triggered" | "failed" | "skipped";
    call_sid?: string;
    error?: string;
  };
};
