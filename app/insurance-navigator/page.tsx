"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";

type IntakeForm = {
  plan_name: string;
  member_id: string;
  group_number: string;
  procedure_description: string;
  zip_code: string;
  callback_phone: string;
  save_insurance_info: boolean;
};

type ValidationIssue = {
  field: keyof IntakeForm | "callback_phone";
  message: string;
};

type RunPayload = {
  intake: {
    plan_name: string;
    member_id: string;
    group_number: string;
    procedure_description: string;
    zip_code: string;
  };
  cpt: {
    cpt_code: string;
    procedure_name: string;
  };
  insurance_call_result: {
    covered: boolean;
    deductible_total: number;
    deductible_met: number;
    deductible_remaining: number;
    coinsurance_percentage: number;
    facility_types_covered: string[];
  };
  providers_ranked: Array<{
    provider_id: string;
    provider_name: string;
    address: string;
    phone: string;
    procedure_price: number;
    accepts_insurance: boolean;
    estimated_patient_cost: number;
  }>;
  recommended_provider_id: string | null;
  meta: {
    adapter: string;
    resolved_member_services_phone: string;
    phone_resolution_source: string;
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

type BookingPayload = {
  confirmation_id: string;
  provider_name: string;
  scheduled_for: string;
  status: "booked";
  booking_phone: string;
};

type BookingCallTriggerPayload = {
  stage: "booking";
  requested: boolean;
  status: "triggered" | "failed";
  call_sid?: string;
  error?: string;
  scheduled_for?: string;
  confirmation_id?: string;
};

type TimelineStageStatus = "pending" | "triggered" | "failed" | "skipped" | "ready";

type TimelineItem = {
  stage: "insurance_verification" | "provider_pricing" | "booking";
  label: string;
  status: TimelineStageStatus;
  detail?: string;
};

const initialForm: IntakeForm = {
  plan_name: "",
  member_id: "",
  group_number: "",
  procedure_description: "",
  zip_code: "",
  callback_phone: "",
  save_insurance_info: true,
};

const SAVED_INSURANCE_STORAGE_KEY = "insurance_navigator_saved_info_v1";

function getLocalStorageOrNull(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = (window as Window & { localStorage?: Storage }).localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    return null;
  }
  return storage;
}

export default function InsuranceNavigatorPage() {
  const [form, setForm] = useState<IntakeForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [result, setResult] = useState<RunPayload | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [preferredDate, setPreferredDate] = useState("");
  const [bookingResult, setBookingResult] = useState<BookingPayload | null>(null);
  const [bookingCallTrigger, setBookingCallTrigger] = useState<BookingCallTriggerPayload | null>(
    null
  );
  const [bookingCallLoading, setBookingCallLoading] = useState(false);
  const [savedPlanBanner, setSavedPlanBanner] = useState<string | null>(null);

  useEffect(() => {
    const storage = getLocalStorageOrNull();
    const savedRaw = storage?.getItem(SAVED_INSURANCE_STORAGE_KEY);
    if (!savedRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(savedRaw) as {
        plan_name?: string;
        member_id?: string;
        group_number?: string;
      };
      if (parsed.plan_name && parsed.member_id && parsed.group_number) {
        setForm((prev) => ({
          ...prev,
          plan_name: parsed.plan_name || "",
          member_id: parsed.member_id || "",
          group_number: parsed.group_number || "",
          save_insurance_info: true,
        }));
        setSavedPlanBanner(parsed.plan_name);
      }
    } catch {
      storage?.removeItem(SAVED_INSURANCE_STORAGE_KEY);
    }
  }, []);

  const issueByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues) {
      if (!map.has(issue.field)) {
        map.set(issue.field, issue.message);
      }
    }
    return map;
  }, [issues]);

  function setField<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setIssues([]);
    setResult(null);
    setServiceError(null);
    setBookingError(null);
    setBookingResult(null);
    setBookingCallTrigger(null);
    setSelectedProviderId(null);

    try {
      const body = {
        ...form,
      };

      const response = await fetch("/api/insurance-navigator/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (response.status === 400 && payload.error === "validation_error") {
        setIssues(payload.issues || []);
        return;
      }

      if (!response.ok) {
        setServiceError(
          "We could not complete the insurance check right now. Please try again."
        );
        return;
      }

      const typedPayload = payload as Partial<RunPayload>;
      const normalizedPayload: RunPayload = {
        intake: {
          plan_name: typedPayload.intake?.plan_name || form.plan_name,
          member_id: typedPayload.intake?.member_id || form.member_id,
          group_number: typedPayload.intake?.group_number || form.group_number,
          procedure_description:
            typedPayload.intake?.procedure_description || form.procedure_description,
          zip_code: typedPayload.intake?.zip_code || form.zip_code,
        },
        cpt: typedPayload.cpt || {
          cpt_code: "99213",
          procedure_name: "Office or outpatient established patient visit",
        },
        insurance_call_result: typedPayload.insurance_call_result || {
          covered: false,
          deductible_total: 0,
          deductible_met: 0,
          deductible_remaining: 0,
          coinsurance_percentage: 0,
          facility_types_covered: [],
        },
        providers_ranked: typedPayload.providers_ranked || [],
        recommended_provider_id: typedPayload.recommended_provider_id || null,
        meta: {
          adapter: typedPayload.meta?.adapter || "unknown",
          resolved_member_services_phone:
            typedPayload.meta?.resolved_member_services_phone || "2298293537",
          phone_resolution_source: typedPayload.meta?.phone_resolution_source || "default_fallback",
          provider_search_adapter: typedPayload.meta?.provider_search_adapter || "mock",
          provider_quote_adapter: typedPayload.meta?.provider_quote_adapter || "mock",
          orchestration_mode: typedPayload.meta?.orchestration_mode || "pipeline",
          outbound_call: typedPayload.meta?.outbound_call || {
            requested: false,
            status: "skipped",
          },
          stage_outbound_calls: typedPayload.meta?.stage_outbound_calls || [],
        },
      };
      setResult(normalizedPayload);
      setSelectedProviderId(normalizedPayload.recommended_provider_id);

      if (form.save_insurance_info) {
        getLocalStorageOrNull()?.setItem(
          SAVED_INSURANCE_STORAGE_KEY,
          JSON.stringify({
            plan_name: form.plan_name.trim(),
            member_id: form.member_id.trim(),
            group_number: form.group_number.trim(),
            saved_at: new Date().toISOString(),
          })
        );
      }
    } catch {
      setServiceError("Network error while checking coverage. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function bookSelectedProvider() {
    if (!result || !selectedProviderId || !preferredDate) {
      setBookingError("Choose a provider and preferred date before booking.");
      return;
    }

    const provider = result.providers_ranked.find((item) => item.provider_id === selectedProviderId);
    if (!provider) {
      setBookingError("Selected provider no longer exists. Re-run the check.");
      return;
    }

    setBookingLoading(true);
    setBookingError(null);
    setBookingResult(null);
    setBookingCallTrigger(null);

    try {
      const response = await fetch("/api/insurance-navigator/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: provider.provider_id,
          provider_name: provider.provider_name,
          provider_phone: provider.phone,
          procedure_name: result.cpt.procedure_name,
          plan_name: result.intake.plan_name,
          member_id: result.intake.member_id,
          group_number: result.intake.group_number,
          preferred_dates: [preferredDate],
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setBookingError("Booking call failed. Try a different date and retry.");
        return;
      }

      const raw = payload as BookingPayload;
      const cleanConfirmation = (raw.confirmation_id || "").replace(/[^A-Za-z0-9-]/g, "");
      const booked: BookingPayload = {
        ...raw,
        scheduled_for: preferredDate,
        confirmation_id: cleanConfirmation || raw.confirmation_id,
      };
      await triggerBookingCallWithContext(booked, result);
      setBookingResult(booked);
    } catch {
      setBookingError("Network error while booking. Please try again.");
    } finally {
      setBookingLoading(false);
    }
  }

  async function triggerBookingCallWithContext(
    bookingContext: BookingPayload,
    runContext: RunPayload
  ) {
    const callbackPhone = form.callback_phone.trim();
    if (!callbackPhone) {
      setBookingError("Add your phone number before triggering booking call.");
      return;
    }

    setBookingCallLoading(true);
    setBookingError(null);
    setBookingCallTrigger(null);
    try {
      const response = await fetch("/api/insurance-navigator/book-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_phone: callbackPhone,
          provider_name: bookingContext.provider_name,
          procedure_name: runContext.cpt.procedure_name,
          preferred_datetime: preferredDate || bookingContext.scheduled_for,
          plan_name: runContext.intake.plan_name,
          member_id: runContext.intake.member_id,
          scheduled_for: bookingContext.scheduled_for,
          confirmation_id: bookingContext.confirmation_id,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setBookingError("Booking call trigger failed. Try again.");
        return;
      }
      setBookingCallTrigger(payload as BookingCallTriggerPayload);
    } catch {
      setBookingError("Network error while triggering booking call.");
    } finally {
      setBookingCallLoading(false);
    }
  }

  async function triggerBookingCall() {
    if (!bookingResult || !result) {
      setBookingError("Complete booking first, then trigger the booking call.");
      return;
    }
    await triggerBookingCallWithContext(bookingResult, result);
  }

  function clearSavedInsuranceInfo() {
    getLocalStorageOrNull()?.removeItem(SAVED_INSURANCE_STORAGE_KEY);
    setSavedPlanBanner(null);
  }

  const timelineItems: TimelineItem[] = React.useMemo(() => {
    if (!result) {
      return [];
    }

    const stageMap = new Map(
      result.meta.stage_outbound_calls.map((item) => [
        item.stage,
        {
          status: item.status as TimelineStageStatus,
          detail:
            item.status === "triggered"
              ? item.call_sid
              : item.status === "failed"
                ? item.error
                : undefined,
        },
      ])
    );

    const insuranceStage = stageMap.get("insurance_verification");
    const providerStage = stageMap.get("provider_pricing");

    let bookingStatus: TimelineStageStatus = "pending";
    let bookingDetail = "";
    if (bookingCallTrigger) {
      bookingStatus = bookingCallTrigger.status;
      if (bookingCallTrigger.status === "triggered") {
        const when = bookingCallTrigger.scheduled_for || bookingResult?.scheduled_for;
        const conf = bookingCallTrigger.confirmation_id || bookingResult?.confirmation_id;
        bookingDetail = [
          when ? `Confirmed for ${when}` : "",
          conf ? `confirmation ${conf}` : "",
        ]
          .filter(Boolean)
          .join(" - ") || bookingCallTrigger.call_sid || "";
      } else {
        bookingDetail = bookingCallTrigger.error || "";
      }
    } else if (bookingResult) {
      bookingStatus = "ready";
      bookingDetail = "Booking complete. Trigger booking call when ready.";
    }

    return [
      {
        stage: "insurance_verification",
        label: "Insurance verification call",
        status: insuranceStage?.status || "pending",
        detail: insuranceStage?.detail,
      },
      {
        stage: "provider_pricing",
        label: "Provider pricing call",
        status: providerStage?.status || "pending",
        detail: providerStage?.detail,
      },
      {
        stage: "booking",
        label: "Booking confirmation call",
        status: bookingStatus,
        detail: bookingDetail || undefined,
      },
    ];
  }, [result, bookingResult, bookingCallTrigger]);

  function stageStatusLabel(status: TimelineStageStatus): string {
    switch (status) {
      case "triggered":
        return "Triggered";
      case "failed":
        return "Failed";
      case "skipped":
        return "Skipped";
      case "ready":
        return "Ready to trigger";
      default:
        return "Pending";
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Insurance Navigator MVP</h1>
        <p style={styles.subtle}>
          Full hackathon flow: verify coverage, compare provider pricing, estimate your
          out-of-pocket cost, and trigger booking.
        </p>
      </header>

      {savedPlanBanner && (
        <div style={styles.savedBanner}>
          Welcome back — using your saved {savedPlanBanner} plan.
          <button type="button" onClick={clearSavedInsuranceInfo} style={styles.clearButton}>
            Clear
          </button>
        </div>
      )}

      <form onSubmit={submit} style={styles.formCard}>
        <Field
          label="Plan Name"
          value={form.plan_name}
          onChange={(v) => setField("plan_name", v)}
          placeholder="Blue Cross PPO"
          error={issueByField.get("plan_name")}
        />
        <Field
          label="Member ID"
          value={form.member_id}
          onChange={(v) => setField("member_id", v)}
          placeholder="MEM001"
          error={issueByField.get("member_id")}
        />
        <Field
          label="Group Number"
          value={form.group_number}
          onChange={(v) => setField("group_number", v)}
          placeholder="GRP001"
          error={issueByField.get("group_number")}
        />
        <Field
          label="Procedure Description"
          value={form.procedure_description}
          onChange={(v) => setField("procedure_description", v)}
          placeholder="My doctor said I need a knee MRI"
          multiline
          error={issueByField.get("procedure_description")}
        />
        <Field
          label="Zip Code"
          value={form.zip_code}
          onChange={(v) => setField("zip_code", v)}
          placeholder="94103"
          error={issueByField.get("zip_code")}
        />
        <Field
          label="Insurance + Booking Demo Number (Your Phone)"
          value={form.callback_phone}
          onChange={(v) => setField("callback_phone", v)}
          placeholder="+12298293537"
          error={issueByField.get("callback_phone")}
        />
        <label style={styles.checkboxWrap}>
          <input
            type="checkbox"
            checked={form.save_insurance_info}
            onChange={(e) => setField("save_insurance_info", e.target.checked)}
          />
          <span>Save my insurance info for future visits</span>
        </label>

        <button type="submit" disabled={loading} style={styles.primaryButton}>
          {loading ? "Checking coverage..." : "Run Insurance Check"}
        </button>
      </form>

      {serviceError && <div style={styles.errorBanner}>{serviceError}</div>}

      {result && (
        <section style={styles.resultCard}>
          <h2 style={styles.h2}>Coverage Snapshot</h2>
          <div style={styles.row}>
            <strong>CPT</strong>
            <span>
              {result.cpt.cpt_code} - {result.cpt.procedure_name}
            </span>
          </div>
          <div style={styles.row}>
            <strong>Covered</strong>
            <span>{result.insurance_call_result.covered ? "Yes" : "No"}</span>
          </div>
          <div style={styles.row}>
            <strong>Deductible</strong>
            <span>
              ${result.insurance_call_result.deductible_met} met of $
              {result.insurance_call_result.deductible_total} (
              ${result.insurance_call_result.deductible_remaining} remaining)
            </span>
          </div>
          <div style={styles.row}>
            <strong>Coinsurance</strong>
            <span>{result.insurance_call_result.coinsurance_percentage}%</span>
          </div>
          <div style={styles.row}>
            <strong>Facility Types</strong>
            <span>{result.insurance_call_result.facility_types_covered.join(", ")}</span>
          </div>
          <div style={styles.row}>
            <strong>Resolved Phone</strong>
            <span>{result.meta.resolved_member_services_phone}</span>
          </div>
          <div style={styles.row}>
            <strong>Adapter / Source</strong>
            <span>{result.meta.adapter} / {result.meta.phone_resolution_source}</span>
          </div>
          <div style={styles.row}>
            <strong>Orchestration</strong>
            <span>{result.meta.orchestration_mode}</span>
          </div>
          <div style={styles.row}>
            <strong>Outbound Call</strong>
            <span>
              {result.meta.outbound_call.status === "triggered"
                ? `Triggered${result.meta.outbound_call.call_sid ? ` (${result.meta.outbound_call.call_sid})` : ""}`
                : result.meta.outbound_call.status === "failed"
                  ? `Failed${result.meta.outbound_call.error ? `: ${result.meta.outbound_call.error}` : ""}`
                  : "Skipped"}
            </span>
          </div>

          {timelineItems.length > 0 && (
            <div style={styles.timelineCard}>
              <h3 style={styles.h3}>Live Call Timeline</h3>
              <div style={styles.timelineList}>
                {timelineItems.map((item) => (
                  <div key={item.stage} style={styles.timelineRow}>
                    <span style={styles.timelineStage}>{item.label}</span>
                    <span style={styles.timelineStatus}>{stageStatusLabel(item.status)}</span>
                    {item.detail && <span style={styles.timelineDetail}>{item.detail}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <h3 style={styles.h3}>Providers (lowest estimated cost first)</h3>
          <div style={styles.providerList}>
            {result.providers_ranked.map((provider) => {
              const isRecommended = provider.provider_id === result.recommended_provider_id;
              const isSelected = provider.provider_id === selectedProviderId;
              return (
                <label key={provider.provider_id} style={styles.providerCard}>
                  <div style={styles.providerHeader}>
                    <input
                      type="radio"
                      name="selected-provider"
                      checked={isSelected}
                      onChange={() => setSelectedProviderId(provider.provider_id)}
                    />
                    <strong>{provider.provider_name}</strong>
                    {isRecommended && <span style={styles.badge}>Recommended</span>}
                  </div>
                  <div style={styles.providerMeta}>{provider.address}</div>
                  <div style={styles.providerMeta}>Call Number: {provider.phone}</div>
                  <div style={styles.providerMeta}>Procedure Price: ${provider.procedure_price}</div>
                  <div style={styles.providerCost}>
                    Estimated Patient Cost: ${provider.estimated_patient_cost}
                  </div>
                </label>
              );
            })}
          </div>

          <div style={styles.bookingCard}>
            <h3 style={styles.h3}>Book Appointment</h3>
            <label style={styles.fieldWrap}>
              <span style={styles.fieldLabel}>Preferred Date / Time</span>
              <input
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                placeholder="Thu 4:00 PM"
                style={styles.input}
              />
            </label>
            <button type="button" onClick={bookSelectedProvider} style={styles.primaryButton}>
              {bookingLoading ? "Calling provider to book..." : "Book Selected Provider"}
            </button>
            {bookingError && <div style={styles.bookingError}>{bookingError}</div>}
            {bookingResult && !bookingCallTrigger && (
              <div style={styles.bookingSuccess}>
                {bookingCallLoading
                  ? `Calling your number now (as the provider scheduler) to book ${bookingResult.provider_name}...`
                  : `Ready to book ${bookingResult.provider_name} for ${bookingResult.scheduled_for}.`}
              </div>
            )}
            {bookingCallTrigger && bookingCallTrigger.status === "failed" && (
              <div style={styles.bookingError}>
                Booking call failed
                {bookingCallTrigger.error ? `: ${bookingCallTrigger.error}` : ""}.
              </div>
            )}
            {bookingCallTrigger && bookingCallTrigger.status === "triggered" && bookingResult && (
              <div style={styles.confirmationCard}>
                <div style={styles.confirmationHeader}>Appointment Confirmed</div>
                <div style={styles.confirmationRow}>
                  <span style={styles.confirmationLabel}>Provider</span>
                  <span style={styles.confirmationValue}>{bookingResult.provider_name}</span>
                </div>
                {result?.cpt?.procedure_name && (
                  <div style={styles.confirmationRow}>
                    <span style={styles.confirmationLabel}>Procedure</span>
                    <span style={styles.confirmationValue}>{result.cpt.procedure_name}</span>
                  </div>
                )}
                <div style={styles.confirmationRow}>
                  <span style={styles.confirmationLabel}>Date / Time</span>
                  <span style={styles.confirmationValue}>
                    {bookingCallTrigger.scheduled_for || bookingResult.scheduled_for}
                  </span>
                </div>
                {(bookingCallTrigger.confirmation_id || bookingResult.confirmation_id) && (
                  <div style={styles.confirmationRow}>
                    <span style={styles.confirmationLabel}>Confirmation</span>
                    <span style={styles.confirmationValue}>
                      {bookingCallTrigger.confirmation_id || bookingResult.confirmation_id}
                    </span>
                  </div>
                )}
                {bookingCallTrigger.call_sid && (
                  <div style={styles.confirmationRow}>
                    <span style={styles.confirmationLabel}>Call ID</span>
                    <span style={styles.confirmationValue}>{bookingCallTrigger.call_sid}</span>
                  </div>
                )}
                <div style={styles.confirmationNote}>
                  A confirmation call was placed to your number. The agent confirmed these details
                  with the scheduler.
                </div>
              </div>
            )}
            {bookingResult && (
              <button type="button" onClick={triggerBookingCall} style={styles.secondaryButton}>
                {bookingCallLoading ? "Calling to book..." : "Re-trigger Booking Call"}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
}) {
  return (
    <label style={styles.fieldWrap}>
      <span style={styles.fieldLabel}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={styles.textarea}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={styles.input}
        />
      )}
      {error && <span style={styles.fieldError}>{error}</span>}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "36px 20px 72px",
  },
  header: { marginBottom: 18 },
  h1: { fontSize: 30, margin: 0 },
  h2: { marginTop: 0, marginBottom: 14, fontSize: 22 },
  h3: { margin: "16px 0 10px", fontSize: 18 },
  subtle: { color: "#9ca3af", marginTop: 8, lineHeight: 1.5 },
  savedBanner: {
    marginBottom: 12,
    background: "#11243a",
    border: "1px solid #3b82f6",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#bfdbfe",
    fontSize: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  clearButton: {
    border: "1px solid #3b82f6",
    background: "transparent",
    color: "#bfdbfe",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
  },
  formCard: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    display: "grid",
    gap: 12,
  },
  fieldWrap: { display: "grid", gap: 6 },
  fieldLabel: { fontSize: 13, color: "#9ca3af" },
  input: {
    background: "#0e0e16",
    color: "#e7e7ef",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  },
  textarea: {
    background: "#0e0e16",
    color: "#e7e7ef",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    resize: "vertical",
  },
  fieldError: { color: "#fda4af", fontSize: 12 },
  checkboxWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#d1d5db",
  },
  primaryButton: {
    marginTop: 4,
    background: "#6ea8fe",
    color: "#06122a",
    border: "none",
    borderRadius: 8,
    padding: "11px 16px",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorBanner: {
    marginTop: 14,
    background: "#3a1620",
    border: "1px solid #e08a8a",
    borderRadius: 10,
    padding: 12,
    color: "#fda4af",
  },
  resultCard: {
    marginTop: 16,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: 14,
  },
  recommendation: {
    marginTop: 14,
    marginBottom: 0,
    color: "#6ee7a8",
    fontWeight: 600,
  },
  providerList: {
    display: "grid",
    gap: 10,
  },
  providerCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 12,
    display: "grid",
    gap: 6,
  },
  providerHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #22c55e",
    color: "#86efac",
  },
  providerMeta: {
    color: "#d1d5db",
    fontSize: 13,
  },
  providerCost: {
    color: "#6ee7a8",
    fontWeight: 600,
  },
  bookingCard: {
    marginTop: 14,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 12,
    display: "grid",
    gap: 10,
  },
  bookingError: {
    color: "#fda4af",
    fontSize: 13,
  },
  bookingSuccess: {
    background: "#0f2f21",
    border: "1px solid #22c55e",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#bbf7d0",
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 4,
    background: "transparent",
    color: "#9ec1ff",
    border: "1px solid rgba(110,168,254,0.5)",
    borderRadius: 8,
    padding: "9px 14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  confirmationCard: {
    background: "linear-gradient(180deg, #0f2f21 0%, #0c2419 100%)",
    border: "1px solid #22c55e",
    borderRadius: 12,
    padding: "14px 16px",
    display: "grid",
    gap: 8,
  },
  confirmationHeader: {
    color: "#bbf7d0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  confirmationRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 14,
  },
  confirmationLabel: {
    color: "#86efac",
    opacity: 0.85,
  },
  confirmationValue: {
    color: "#f0fff7",
    fontWeight: 600,
    textAlign: "right" as const,
  },
  confirmationNote: {
    marginTop: 4,
    color: "#a7f3d0",
    fontSize: 12,
    opacity: 0.8,
  },
  timelineCard: {
    marginTop: 14,
    background: "rgba(17, 36, 58, 0.35)",
    border: "1px solid rgba(147,197,253,0.4)",
    borderRadius: 10,
    padding: 12,
  },
  timelineList: {
    display: "grid",
    gap: 8,
  },
  timelineRow: {
    display: "grid",
    gap: 3,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    paddingBottom: 8,
  },
  timelineStage: {
    fontSize: 13,
    color: "#dbeafe",
    fontWeight: 600,
  },
  timelineStatus: {
    fontSize: 13,
    color: "#93c5fd",
  },
  timelineDetail: {
    fontSize: 12,
    color: "#9ca3af",
    wordBreak: "break-word",
  },
};
