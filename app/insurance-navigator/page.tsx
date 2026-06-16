"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  LIVE_CALL_RESULT_POLL_INTERVAL_MS,
  LIVE_CALL_RESULT_POLL_MAX_ATTEMPTS,
} from "@/features/insurance-navigator/config/constants";

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

const THEME_PRESETS: Array<{ name: string; css: string; swatch: string }> = [
  {
    name: "Quantum",
    css:
      "radial-gradient(120% 120% at 18% 22%, #5b2bd6 0%, transparent 55%), radial-gradient(120% 120% at 82% 28%, #df4fb2 0%, transparent 50%), radial-gradient(130% 130% at 72% 92%, #f2913d 0%, transparent 55%), linear-gradient(135deg, #361a82, #7b2fc4 52%, #ea5d9c)",
    swatch: "linear-gradient(120deg, #5b2bd6, #df4fb2 55%, #f2913d)",
  },
  {
    name: "Aurora",
    css:
      "radial-gradient(120% 120% at 20% 20%, #1f9e8f 0%, transparent 55%), radial-gradient(120% 120% at 82% 30%, #66d6ac 0%, transparent 50%), radial-gradient(130% 130% at 70% 92%, #3a6df0 0%, transparent 55%), linear-gradient(135deg, #0e6a66, #1fa18f 52%, #3f7ef0)",
    swatch: "linear-gradient(120deg, #1f9e8f, #66d6ac 50%, #3f7ef0)",
  },
  {
    name: "Ember",
    css:
      "radial-gradient(120% 120% at 20% 20%, #f4b53c 0%, transparent 55%), radial-gradient(120% 120% at 82% 32%, #ea6a2e 0%, transparent 52%), radial-gradient(130% 130% at 70% 92%, #b22a5e 0%, transparent 55%), linear-gradient(135deg, #c0421f, #e5602f 50%, #f0a93c)",
    swatch: "linear-gradient(120deg, #f4b53c, #ea6a2e 50%, #b22a5e)",
  },
  {
    name: "Tidal",
    css:
      "radial-gradient(120% 120% at 18% 22%, #2b5bd6 0%, transparent 55%), radial-gradient(120% 120% at 82% 28%, #3fc6e8 0%, transparent 50%), radial-gradient(130% 130% at 72% 92%, #6a3fd6 0%, transparent 55%), linear-gradient(135deg, #16357f, #2c63c4 52%, #46c7e0)",
    swatch: "linear-gradient(120deg, #2b5bd6, #3fc6e8 50%, #6a3fd6)",
  },
  {
    name: "Bloom",
    css:
      "radial-gradient(120% 120% at 20% 20%, #e85aa8 0%, transparent 55%), radial-gradient(120% 120% at 82% 30%, #f59abf 0%, transparent 50%), radial-gradient(130% 130% at 70% 92%, #f4a259 0%, transparent 55%), linear-gradient(135deg, #c23a86, #e85aa8 52%, #f4b07a)",
    swatch: "linear-gradient(120deg, #e85aa8, #f59abf 50%, #f4a259)",
  },
];

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
  const [liveCallSid, setLiveCallSid] = useState<string | null>(null);
  const [liveCallStatus, setLiveCallStatus] = useState<
    "idle" | "polling" | "ready" | "failed"
  >("idle");
  const [coverageSource, setCoverageSource] = useState<"ai_estimate" | "live_call">(
    "ai_estimate"
  );
  const [bookingLiveSid, setBookingLiveSid] = useState<string | null>(null);
  const [bookingLiveStatus, setBookingLiveStatus] = useState<
    "idle" | "polling" | "ready" | "failed"
  >("idle");
  const [bookingSource, setBookingSource] = useState<"ai_estimate" | "live_call">(
    "ai_estimate"
  );
  const [preferredDate, setPreferredDate] = useState("");
  const [bookingResult, setBookingResult] = useState<BookingPayload | null>(null);
  const [bookingCallTrigger, setBookingCallTrigger] = useState<BookingCallTriggerPayload | null>(
    null
  );
  const [bookingCallLoading, setBookingCallLoading] = useState(false);
  const [savedPlanBanner, setSavedPlanBanner] = useState<string | null>(null);
  const [themeIdx, setThemeIdx] = useState(0);

  const theme = THEME_PRESETS[themeIdx];
  // While a live verification call is in progress we must NOT show the AI estimate as if
  // it were real coverage data. Hold the coverage fields until the live result lands.
  const coveragePending = liveCallStatus === "polling";
  const bookingPending = bookingLiveStatus === "polling";
  function shuffleTheme() {
    setThemeIdx((prev) => {
      if (THEME_PRESETS.length < 2) return prev;
      let next = prev;
      while (next === prev) {
        next = Math.floor(Math.random() * THEME_PRESETS.length);
      }
      return next;
    });
  }

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

  useEffect(() => {
    if (!liveCallSid || liveCallStatus !== "polling") {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/insurance-navigator/call-result?call_sid=${encodeURIComponent(
            liveCallSid as string
          )}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          status?: string;
          result?: RunPayload["insurance_call_result"];
        };
        if (cancelled) {
          return;
        }
        if (payload.status === "ready" && payload.result) {
          const liveResult = payload.result;
          setResult((prev) =>
            prev ? { ...prev, insurance_call_result: liveResult } : prev
          );
          setCoverageSource("live_call");
          setLiveCallStatus("ready");
          return;
        }
        if (payload.status === "failed") {
          setLiveCallStatus("failed");
          return;
        }
      } catch {
        // Swallow transient polling errors; keep trying until the attempt budget runs out.
      }
      if (!cancelled && attempts >= LIVE_CALL_RESULT_POLL_MAX_ATTEMPTS) {
        setLiveCallStatus("failed");
      }
    }

    const timer = setInterval(() => {
      if (liveCallStatus !== "polling") {
        return;
      }
      void poll();
    }, LIVE_CALL_RESULT_POLL_INTERVAL_MS);

    void poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [liveCallSid, liveCallStatus]);

  useEffect(() => {
    if (!bookingLiveSid || bookingLiveStatus !== "polling") {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/insurance-navigator/call-result?call_sid=${encodeURIComponent(
            bookingLiveSid as string
          )}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          status?: string;
          booking?: { confirmation_id: string; scheduled_for: string; booked: boolean };
        };
        if (cancelled) {
          return;
        }
        if (payload.status === "ready" && payload.booking) {
          const liveBooking = payload.booking;
          setBookingResult((prev) =>
            prev
              ? {
                  ...prev,
                  scheduled_for: liveBooking.scheduled_for || prev.scheduled_for,
                  confirmation_id: liveBooking.confirmation_id || prev.confirmation_id,
                }
              : prev
          );
          setBookingSource("live_call");
          setBookingLiveStatus("ready");
          return;
        }
        if (payload.status === "failed") {
          setBookingLiveStatus("failed");
          return;
        }
      } catch {
        // Swallow transient polling errors; keep trying until the attempt budget runs out.
      }
      if (!cancelled && attempts >= LIVE_CALL_RESULT_POLL_MAX_ATTEMPTS) {
        setBookingLiveStatus("failed");
      }
    }

    const timer = setInterval(() => {
      void poll();
    }, LIVE_CALL_RESULT_POLL_INTERVAL_MS);

    void poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bookingLiveSid, bookingLiveStatus]);

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
    setLiveCallSid(null);
    setLiveCallStatus("idle");
    setCoverageSource("ai_estimate");

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

      // The Coverage Snapshot above is an immediate AI estimate. If a live insurance
      // verification call was actually placed, poll the bridge for the real
      // transcript-derived result and swap it in once the call ends.
      const insuranceCallSid =
        normalizedPayload.meta.stage_outbound_calls.find(
          (item) =>
            item.stage === "insurance_verification" &&
            item.status === "triggered" &&
            item.call_sid
        )?.call_sid ||
        (normalizedPayload.meta.outbound_call.status === "triggered"
          ? normalizedPayload.meta.outbound_call.call_sid
          : undefined);

      if (insuranceCallSid) {
        setLiveCallSid(insuranceCallSid);
        setLiveCallStatus("polling");
      }

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

    if (!form.callback_phone.trim()) {
      setBookingError("Add your phone number before booking (the agent calls you as the scheduler).");
      return;
    }

    setBookingLoading(true);
    setBookingError(null);
    setBookingResult(null);
    setBookingCallTrigger(null);
    setBookingLiveSid(null);
    setBookingLiveStatus("idle");
    setBookingSource("ai_estimate");

    // Mirror the insurance flow: place the live booking call directly and populate the
    // card from the real transcript. No AI-simulated confirmation is shown — the
    // confirmation number and scheduled time come only from the live call.
    const placeholder: BookingPayload = {
      confirmation_id: "",
      provider_name: provider.provider_name,
      scheduled_for: preferredDate,
      status: "booked",
      booking_phone: provider.phone,
    };

    try {
      await triggerBookingCallWithContext(placeholder, result);
      setBookingResult(placeholder);
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
    setBookingLiveSid(null);
    setBookingLiveStatus("idle");
    setBookingSource("ai_estimate");
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
      const triggerPayload = payload as BookingCallTriggerPayload;
      setBookingCallTrigger(triggerPayload);

      // The confirmation shown is an AI estimate until the live booking call ends.
      // Poll the bridge for the real scheduler-confirmed details and swap them in.
      if (triggerPayload.status === "triggered" && triggerPayload.call_sid) {
        setBookingLiveSid(triggerPayload.call_sid);
        setBookingLiveStatus("polling");
      }
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
        const when = bookingResult?.scheduled_for || bookingCallTrigger.scheduled_for;
        const conf = bookingResult?.confirmation_id || bookingCallTrigger.confirmation_id;
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
    <main className="in-main">
      <div className="in-topbar in-reveal" style={{ animationDelay: "0.04s" }}>
        <span className="in-chip">
          <span className="in-chip-dot" />
          Patient&apos;s Navigator
        </span>
        <span className="in-chip in-chip--ghost">Insurance · MVP</span>
      </div>

      {savedPlanBanner && (
        <div className="in-banner in-reveal" style={{ animationDelay: "0.08s" }}>
          <span>
            Welcome back — using your saved <strong>{savedPlanBanner}</strong> plan.
          </span>
          <button type="button" onClick={clearSavedInsuranceInfo} className="in-clear">
            Clear
          </button>
        </div>
      )}

      <div className="in-compose">
        <aside className="in-poster-col in-reveal" style={{ animationDelay: "0.08s" }}>
          <div className="in-poster" style={{ backgroundImage: theme.css }}>
            <span className="in-poster-brand">PATIENT&apos;S NAVIGATOR</span>
            <div className="in-poster-cap">
              {form.procedure_description.trim() || "Your care, sorted."}
            </div>
            <button
              type="button"
              className="in-poster-emoji"
              onClick={shuffleTheme}
              aria-label="Shuffle theme"
            >
              🩺
            </button>
          </div>
          <div className="in-theme">
            <div className="in-theme-card">
              <span className="in-theme-swatch" style={{ backgroundImage: theme.swatch }} />
              <span className="in-theme-meta">
                <span className="in-theme-label">Theme</span>
                <span className="in-theme-name">{theme.name}</span>
              </span>
            </div>
            <button
              type="button"
              className="in-shuffle"
              onClick={shuffleTheme}
              aria-label="Shuffle theme"
            >
              ⇄
            </button>
          </div>
        </aside>

        <form onSubmit={submit} className="in-card in-reveal" style={{ animationDelay: "0.12s" }}>
          <h1 className="in-title">
            Estimate your <em>cost</em>.
          </h1>
          <p className="in-lede">
            Verify coverage, compare real provider pricing, and trigger the booking call — before
            you commit.
          </p>
          <div className="in-form">
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
            <label className="in-check">
              <input
                type="checkbox"
                checked={form.save_insurance_info}
                onChange={(e) => setField("save_insurance_info", e.target.checked)}
              />
              <span>Save my insurance info for future visits</span>
            </label>

            <button type="submit" disabled={loading} className="in-btn in-btn-primary in-btn-block">
              {loading ? "Checking coverage..." : "Run Insurance Check"}
            </button>
          </div>
        </form>
      </div>

      {serviceError && <div className="in-error">{serviceError}</div>}

      {result && (
        <section className="in-card in-reveal in-results">
          <p className="in-kicker">What we found</p>
          <h2 className="in-h2">Coverage Snapshot</h2>
          {(() => {
            const isLive = coverageSource === "live_call";
            const badge = isLive
              ? { text: "Live call result", bg: "rgba(34,139,87,0.14)", fg: "#1c7a4d" }
              : liveCallStatus === "polling"
                ? {
                    text: "Verifying coverage on the live call...",
                    bg: "rgba(180,120,30,0.14)",
                    fg: "#9a6712",
                  }
                : liveCallStatus === "failed"
                  ? {
                      text: "AI estimate - live call result unavailable",
                      bg: "rgba(180,120,30,0.14)",
                      fg: "#9a6712",
                    }
                  : { text: "AI estimate", bg: "rgba(120,120,140,0.14)", fg: "#5b5b6b" };
            return (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  background: badge.bg,
                  color: badge.fg,
                  marginBottom: 14,
                }}
              >
                {liveCallStatus === "polling" && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "currentColor",
                      animation: "in-pulse 1.2s ease-in-out infinite",
                    }}
                  />
                )}
                {badge.text}
              </div>
            );
          })()}
          <div className="in-stats">
            <div className="in-stat">
              <span className="in-stat-key">CPT</span>
              <span className="in-stat-val">
                {result.cpt.cpt_code} - {result.cpt.procedure_name}
              </span>
            </div>
            <div className="in-stat">
              <span className="in-stat-key">Covered</span>
              {coveragePending ? (
                <span className="in-stat-val" style={{ opacity: 0.55, fontStyle: "italic" }}>
                  Verifying on the call...
                </span>
              ) : (
                <span
                  className={
                    result.insurance_call_result.covered
                      ? "in-stat-val in-covered-yes"
                      : "in-stat-val in-covered-no"
                  }
                >
                  {result.insurance_call_result.covered ? "Yes" : "No"}
                </span>
              )}
            </div>
            <div className="in-stat">
              <span className="in-stat-key">Deductible</span>
              {coveragePending ? (
                <span className="in-stat-val" style={{ opacity: 0.55, fontStyle: "italic" }}>
                  Verifying on the call...
                </span>
              ) : (
                <span className="in-stat-val">
                  ${result.insurance_call_result.deductible_met} met of $
                  {result.insurance_call_result.deductible_total} (
                  ${result.insurance_call_result.deductible_remaining} remaining)
                </span>
              )}
            </div>
            <div className="in-stat">
              <span className="in-stat-key">Coinsurance</span>
              {coveragePending ? (
                <span className="in-stat-val" style={{ opacity: 0.55, fontStyle: "italic" }}>
                  Verifying on the call...
                </span>
              ) : (
                <span className="in-stat-val">
                  {result.insurance_call_result.coinsurance_percentage}%
                </span>
              )}
            </div>
            <div className="in-stat">
              <span className="in-stat-key">Facility Types</span>
              {coveragePending ? (
                <span className="in-stat-val" style={{ opacity: 0.55, fontStyle: "italic" }}>
                  Verifying on the call...
                </span>
              ) : (
                <span className="in-stat-val">
                  {result.insurance_call_result.facility_types_covered.join(", ")}
                </span>
              )}
            </div>
            <div className="in-stat">
              <span className="in-stat-key">Outbound Call</span>
              <span className="in-stat-val in-stat-val--mono">
                {result.meta.outbound_call.status === "triggered"
                  ? `Triggered${result.meta.outbound_call.call_sid ? ` (${result.meta.outbound_call.call_sid})` : ""}`
                  : result.meta.outbound_call.status === "failed"
                    ? `Failed${result.meta.outbound_call.error ? `: ${result.meta.outbound_call.error}` : ""}`
                    : "Skipped"}
              </span>
            </div>
          </div>

          {timelineItems.length > 0 && (
            <div className="in-timeline">
              <h3 className="in-h3" style={{ marginTop: 0 }}>Live Call Timeline</h3>
              <div className="in-timeline-list">
                {timelineItems.map((item) => (
                  <div key={item.stage} className="in-timeline-row" data-status={item.status}>
                    <span className="in-timeline-stage">{item.label}</span>
                    <span className="in-pill" data-status={item.status}>
                      {stageStatusLabel(item.status)}
                    </span>
                    {item.detail && <span className="in-timeline-detail">{item.detail}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <h3 className="in-h3">Providers (lowest estimated cost first)</h3>
          <div className="in-providers">
            {result.providers_ranked.map((provider) => {
              const isRecommended = provider.provider_id === result.recommended_provider_id;
              const isSelected = provider.provider_id === selectedProviderId;
              return (
                <label key={provider.provider_id} className="in-provider" data-selected={isSelected}>
                  <div className="in-provider-head">
                    <input
                      type="radio"
                      name="selected-provider"
                      checked={isSelected}
                      onChange={() => setSelectedProviderId(provider.provider_id)}
                    />
                    <span className="in-provider-name">{provider.provider_name}</span>
                    {isRecommended && <span className="in-badge">Recommended</span>}
                  </div>
                  <div className="in-provider-meta">{provider.address}</div>
                  <div className="in-provider-meta">Call Number: {provider.phone}</div>
                  <div className="in-provider-meta">Procedure Price: ${provider.procedure_price}</div>
                  <div className="in-provider-cost">
                    Estimated Patient Cost: <b>${provider.estimated_patient_cost}</b>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="in-booking">
            <h3 className="in-h3" style={{ marginTop: 0 }}>Book Appointment</h3>
            <label className="in-field">
              <span className="in-label">Preferred Date / Time</span>
              <input
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                placeholder="Thu 4:00 PM"
                className="in-input"
              />
            </label>
            <button type="button" onClick={bookSelectedProvider} className="in-btn in-btn-primary">
              {bookingLoading ? "Calling provider to book..." : "Book Selected Provider"}
            </button>
            {bookingError && <div className="in-error" style={{ marginTop: 0 }}>{bookingError}</div>}
            {bookingResult && !bookingCallTrigger && (
              <div className="in-booking-success">
                {bookingCallLoading
                  ? `Calling your number now (as the provider scheduler) to book ${bookingResult.provider_name}...`
                  : `Ready to book ${bookingResult.provider_name} for ${bookingResult.scheduled_for}.`}
              </div>
            )}
            {bookingCallTrigger && bookingCallTrigger.status === "failed" && (
              <div className="in-error" style={{ marginTop: 0 }}>
                Booking call failed
                {bookingCallTrigger.error ? `: ${bookingCallTrigger.error}` : ""}.
              </div>
            )}
            {bookingCallTrigger && bookingCallTrigger.status === "triggered" && bookingResult && (
              <div className="in-confirmation">
                <div className="in-confirmation-head">
                  {bookingPending ? "Booking on the live call..." : "Appointment Confirmed"}
                </div>
                {(() => {
                  const isLive = bookingSource === "live_call";
                  const badge = isLive
                    ? { text: "Live call result", bg: "rgba(34,139,87,0.14)", fg: "#1c7a4d" }
                    : bookingLiveStatus === "polling"
                      ? {
                          text: "Confirming booking on the live call...",
                          bg: "rgba(180,120,30,0.14)",
                          fg: "#9a6712",
                        }
                      : bookingLiveStatus === "failed"
                        ? {
                            text: "Live booking result unavailable",
                            bg: "rgba(180,120,30,0.14)",
                            fg: "#9a6712",
                          }
                        : { text: "Confirming booking on the live call...", bg: "rgba(180,120,30,0.14)", fg: "#9a6712" };
                  return (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        background: badge.bg,
                        color: badge.fg,
                        margin: "6px 0 12px",
                      }}
                    >
                      {bookingLiveStatus === "polling" && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "currentColor",
                            animation: "in-pulse 1.2s ease-in-out infinite",
                          }}
                        />
                      )}
                      {badge.text}
                    </div>
                  );
                })()}
                <div className="in-confirmation-row">
                  <span className="in-confirmation-label">Provider</span>
                  <span className="in-confirmation-value">{bookingResult.provider_name}</span>
                </div>
                {result?.cpt?.procedure_name && (
                  <div className="in-confirmation-row">
                    <span className="in-confirmation-label">Procedure</span>
                    <span className="in-confirmation-value">{result.cpt.procedure_name}</span>
                  </div>
                )}
                <div className="in-confirmation-row">
                  <span className="in-confirmation-label">Date / Time</span>
                  <span
                    className="in-confirmation-value"
                    style={bookingPending ? { opacity: 0.55, fontStyle: "italic" } : undefined}
                  >
                    {bookingPending
                      ? "Confirming on the call..."
                      : bookingResult.scheduled_for || bookingCallTrigger.scheduled_for}
                  </span>
                </div>
                <div className="in-confirmation-row">
                  <span className="in-confirmation-label">Confirmation</span>
                  {bookingPending ? (
                    <span
                      className="in-confirmation-value"
                      style={{ opacity: 0.55, fontStyle: "italic" }}
                    >
                      Confirming on the call...
                    </span>
                  ) : (
                    <span className="in-confirmation-value">
                      {bookingResult.confirmation_id || bookingCallTrigger.confirmation_id || "-"}
                    </span>
                  )}
                </div>
                {bookingCallTrigger.call_sid && (
                  <div className="in-confirmation-row">
                    <span className="in-confirmation-label">Call ID</span>
                    <span className="in-confirmation-value">{bookingCallTrigger.call_sid}</span>
                  </div>
                )}
                <div className="in-confirmation-note">
                  {bookingPending
                    ? "A live call is underway. The agent is confirming these details with the scheduler now."
                    : "A confirmation call was placed to your number. The agent confirmed these details with the scheduler."}
                </div>
              </div>
            )}
            {bookingResult && (
              <button type="button" onClick={triggerBookingCall} className="in-btn in-btn-secondary">
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
    <label className="in-field">
      <span className="in-label">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="in-textarea"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="in-input"
        />
      )}
      {error && <span className="in-field-error">{error}</span>}
    </label>
  );
}
