import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import InterviewChat from "../components/InterviewChat";

/**
 * AdminOnboardingPage — three-step setup flow for new client admins.
 *
 *   Step 1 · Company Info     → structured form (size, years, geo, etc.)
 *   Step 2 · AI Interview     → InterviewChat (V2.1 onboarding prompt)
 *   Step 3 · Review           → confirm AI summary, /confirm endpoint
 *                               builds the interview_prompt_supplement
 *
 * Phase-3 redesign notes:
 *   • Replaces the generic blue header strip + plain step pills with
 *     the v2 token system: paper background, Fraunces display type,
 *     pulse-green accents, dark "ink" buttons.
 *   • Mobile-first: full-bleed below sm, centered card-shaped column
 *     above sm to match the resident chat aesthetic.
 *   • Step indicator is a thin progress strip (matches resident chat
 *     ProgressBar) plus a numbered pill row underneath.
 *   • Success card uses pulse-tint dot + Fraunces title + btn-pulse.
 */

const COMPANY_SIZES = [
  "1-5 employees",
  "6-15 employees",
  "16-50 employees",
  "51-100 employees",
  "100+ employees",
];

const YEARS_OPTIONS = [
  "Less than 1 year",
  "1-3 years",
  "3-5 years",
  "5-10 years",
  "10-20 years",
  "20+ years",
];

const STEPS = [
  { key: "form", label: "Company info" },
  { key: "chat", label: "AI interview" },
  { key: "confirm", label: "Review" },
];

export default function AdminOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const interviewType = searchParams.get("type") === "re_interview" ? "re_interview" : "initial";
  const launchRoundId = searchParams.get("launch_round");

  const [step, setStep] = useState("form");
  const [interviewId, setInterviewId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [user, setUser] = useState(null);
  const [launchingRound, setLaunchingRound] = useState(false);
  const [launchError, setLaunchError] = useState(null);

  const [companySize, setCompanySize] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [geographicArea, setGeographicArea] = useState("");
  const [communitiesManaged, setCommunitiesManaged] = useState("");
  const [competitiveAdvantages, setCompetitiveAdvantages] = useState("");

  useEffect(() => {
    checkAuthAndResume();
  }, []);

  const checkAuthAndResume = async () => {
    try {
      const authRes = await fetch("/api/auth/status", { credentials: "include" });
      const authData = await authRes.json();
      if (!authData.authenticated || authData.user.role !== "client_admin") {
        navigate("/admin/login");
        return;
      }
      setUser(authData.user);

      const statusRes = await fetch("/api/admin/interview/status", { credentials: "include" });
      const statusData = await statusRes.json();

      if (statusData.activeInterviewId) {
        const interviewRes = await fetch(`/api/admin/interview/${statusData.activeInterviewId}`, {
          credentials: "include",
        });
        const interviewData = await interviewRes.json();

        setInterviewId(statusData.activeInterviewId);

        if (interviewData.interview.company_size) {
          setCompanySize(interviewData.interview.company_size || "");
          setYearsInBusiness(interviewData.interview.years_in_business || "");
          setGeographicArea(interviewData.interview.geographic_area || "");
          setCommunitiesManaged(interviewData.interview.communities_managed?.toString() || "");
          setCompetitiveAdvantages(interviewData.interview.competitive_advantages || "");

          if (interviewData.messages.length > 0) {
            setChatMessages(
              interviewData.messages.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: m.created_at,
              }))
            );
            setStep("chat");
          }
        }
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      navigate("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let id = interviewId;
      if (!id) {
        const createRes = await fetch("/api/admin/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ interview_type: interviewType }),
        });
        const createData = await createRes.json();
        id = createData.interview_id;
        setInterviewId(id);
      }

      const res = await fetch(`/api/admin/interview/${id}/structured`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_size: companySize,
          years_in_business: yearsInBusiness,
          geographic_area: geographicArea,
          communities_managed: communitiesManaged ? Number(communitiesManaged) : null,
          competitive_advantages: competitiveAdvantages,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setChatMessages([
        { role: "assistant", content: data.message, timestamp: new Date().toISOString() },
      ]);
      setStep("chat");
    } catch (err) {
      console.error("Form submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSummaryDetected = (aiMessage) => {
    setSummaryMessage(aiMessage);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/admin/interview/${interviewId}/confirm`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmResult(data);
    } catch (err) {
      console.error("Confirm error:", err);
      setConfirming(false);
    }
  };

  const handleAddMore = () => {
    setStep("chat");
    setSummaryMessage("");
  };

  const handleSkip = async () => {
    if (interviewId) {
      await fetch(`/api/admin/interview/${interviewId}/abandon`, {
        method: "PATCH",
        credentials: "include",
      });
    }
    navigate("/admin");
  };

  // Finish Interview advances directly to the Review step. The
  // previous version POSTed a synthetic "I'd like to wrap up" message
  // to the AI before advancing — but if the conversation had already
  // wrapped naturally (the common case under V2.1), the /message
  // endpoint required status='in_progress' and could refuse, leaving
  // the user stuck on the chat step with no feedback.
  //
  // Recap content for the Review step is the last AI message from the
  // existing transcript (the natural close), with a generic fallback
  // when there isn't one. The /confirm endpoint generates the actual
  // supplement; this is just a preview of what the user is approving.
  const handleEndEarly = () => {
    if (!interviewId) {
      setLaunchError("No interview found. Refresh the page and complete the form again.");
      return;
    }
    const lastAssistant = [...chatMessages].reverse().find((m) => m.role === "assistant");
    setSummaryMessage(
      lastAssistant?.content ||
        "Here's the conversation we had. Confirm to generate the AI supplement that briefs board interviews on your priorities."
    );
    setStep("confirm");
  };

  const handleLaunchRound = async () => {
    setLaunchingRound(true);
    setLaunchError(null);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${launchRoundId}/launch`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        navigate(`/admin/rounds/${launchRoundId}`);
      } else {
        setLaunchError(data.error);
      }
    } catch {
      setLaunchError("Failed to launch round");
    } finally {
      setLaunchingRound(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
        }}
      >
        <div
          className="w-7 h-7 rounded-full animate-spin"
          style={{
            border: "3px solid var(--paper-3)",
            borderTopColor: "var(--pulse)",
          }}
        />
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────
  if (confirmResult) {
    return (
      <PageShell>
        <div
          className="rounded-3xl bg-white text-center"
          style={{
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-lg)",
            padding: "40px 32px",
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          <div
            className="rounded-full mx-auto flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
              boxShadow: "0 6px 20px rgba(31,165,113,0.25)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2
            className="mt-4 font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            You're all set.
          </h2>
          <p
            className="mt-2 text-[14px] leading-relaxed"
            style={{ color: "var(--ink-3)", maxWidth: 360, margin: "8px auto 0" }}
          >
            Your company profile is saved. The AI interviewer will use this context to ask board
            members about the things that actually matter to <em>your</em> communities.
          </p>

          {launchError && (
            <div
              className="mt-5 rounded-lg p-3 text-[12.5px] text-left"
              style={{
                backgroundColor: "var(--coral-tint)",
                color: "var(--coral)",
                border: "1px solid var(--coral-soft, rgba(232,93,76,0.25))",
              }}
            >
              {launchError}
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            {launchRoundId ? (
              <>
                <button
                  onClick={handleLaunchRound}
                  disabled={launchingRound}
                  className="font-semibold text-white rounded-xl transition hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--pulse)",
                    boxShadow: "var(--shadow-sm)",
                    padding: "11px 22px",
                    fontSize: 14,
                  }}
                >
                  {launchingRound ? "Launching…" : "Launch round now →"}
                </button>
                <button
                  onClick={() => navigate("/admin")}
                  className="font-semibold rounded-xl transition"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--ink-2)",
                    border: "1px solid var(--line-2)",
                    padding: "11px 22px",
                    fontSize: 14,
                  }}
                >
                  Not now
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate("/admin")}
                className="font-semibold text-white rounded-xl transition hover:opacity-90"
                style={{
                  backgroundColor: "var(--pulse)",
                  boxShadow: "var(--shadow-sm)",
                  padding: "11px 26px",
                  fontSize: 14,
                }}
              >
                Go to your dashboard →
              </button>
            )}
          </div>
        </div>
      </PageShell>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <PageShell>
      {/* Header band */}
      <div className="mb-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <div
            className="text-[10.5px] font-semibold uppercase mb-1"
            style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
          >
            {interviewType === "re_interview" ? "Company check-in" : "Onboarding"}
          </div>
          <h1
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {interviewType === "re_interview"
              ? "What's changed since we last spoke?"
              : "Let's brief the AI on your business."}
          </h1>
          {user?.company_name && (
            <p className="text-[12.5px] mt-1 truncate" style={{ color: "var(--ink-3)" }}>
              {user.company_name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSkip}
          className="flex-shrink-0 text-[12px] underline transition hover:opacity-80"
          style={{ color: "var(--ink-4)" }}
        >
          Do this later
        </button>
      </div>

      {/* Progress strip + step pills */}
      <div className="mb-5">
        <div
          className="relative overflow-hidden rounded-full"
          style={{ height: 3, backgroundColor: "var(--paper-3)" }}
          aria-hidden="true"
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progressPercent}%`, backgroundColor: "var(--pulse)" }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {STEPS.map((s, i) => {
            const isCurrent = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span
                  className="rounded-full flex items-center justify-center text-[11px] font-semibold transition"
                  style={{
                    width: 22,
                    height: 22,
                    backgroundColor: isDone
                      ? "var(--pulse)"
                      : isCurrent
                        ? "var(--ink)"
                        : "var(--paper-3)",
                    color: isDone || isCurrent ? "white" : "var(--ink-4)",
                  }}
                >
                  {isDone ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className="text-[12.5px] font-medium"
                  style={{
                    color: isCurrent ? "var(--ink)" : isDone ? "var(--ink-3)" : "var(--ink-4)",
                  }}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span
                    className="hidden sm:inline-block"
                    style={{
                      width: 24,
                      height: 1,
                      backgroundColor: "var(--line-2)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      {step === "form" && (
        <div className="space-y-4">
          <PreambleCard interviewType={interviewType} />
          <FormCard
            companySize={companySize}
            setCompanySize={setCompanySize}
            yearsInBusiness={yearsInBusiness}
            setYearsInBusiness={setYearsInBusiness}
            geographicArea={geographicArea}
            setGeographicArea={setGeographicArea}
            communitiesManaged={communitiesManaged}
            setCommunitiesManaged={setCommunitiesManaged}
            competitiveAdvantages={competitiveAdvantages}
            setCompetitiveAdvantages={setCompetitiveAdvantages}
            submitting={submitting}
            onSubmit={handleFormSubmit}
          />
        </div>
      )}

      {step === "chat" && interviewId && (
        <InterviewChat
          interviewId={interviewId}
          initialMessages={chatMessages}
          onComplete={handleSummaryDetected}
          onEndEarly={handleEndEarly}
        />
      )}

      {step === "confirm" && (
        <ConfirmCard
          summary={summaryMessage}
          confirming={confirming}
          onConfirm={handleConfirm}
          onAddMore={handleAddMore}
        />
      )}

      {confirming && step === "confirm" && <ConfirmingOverlay />}
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function PageShell({ children }) {
  return (
    <div
      className="min-h-[100dvh] py-6 px-4 sm:py-10"
      style={{
        background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div className="max-w-[640px] mx-auto">{children}</div>
    </div>
  );
}

function PreambleCard({ interviewType }) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        padding: 22,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-full flex-shrink-0 flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
            boxShadow: "0 2px 8px rgba(31,165,113,0.25)",
          }}
          aria-hidden="true"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h4l2-7 4 14 2-7h6" />
          </svg>
        </div>
        <div className="min-w-0">
          <h2
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            {interviewType === "re_interview"
              ? "Quick check-in to keep your AI brief sharp"
              : "Why a five-minute brief makes board interviews dramatically better"}
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
            When the AI interviews your board members, it needs the unique context of your
            management company — your size, your market, what makes you different. Without it, every
            board gets the same generic questions. With it, the AI asks about the things that
            actually matter to <em>your</em> communities.
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--ink-4)" }}>
            Five minutes total. A few quick questions below, then a short conversation.
          </p>
        </div>
      </div>
    </div>
  );
}

function FormCard({
  companySize,
  setCompanySize,
  yearsInBusiness,
  setYearsInBusiness,
  geographicArea,
  setGeographicArea,
  communitiesManaged,
  setCommunitiesManaged,
  competitiveAdvantages,
  setCompetitiveAdvantages,
  submitting,
  onSubmit,
}) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        padding: 22,
      }}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Number of employees">
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full text-[13.5px] rounded-lg outline-none transition"
              style={{
                border: "1px solid var(--line-2)",
                padding: "9px 12px",
                color: "var(--ink)",
                backgroundColor: "white",
              }}
              required
            >
              <option value="">Select…</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Years in business">
            <select
              value={yearsInBusiness}
              onChange={(e) => setYearsInBusiness(e.target.value)}
              className="w-full text-[13.5px] rounded-lg outline-none transition"
              style={{
                border: "1px solid var(--line-2)",
                padding: "9px 12px",
                color: "var(--ink)",
                backgroundColor: "white",
              }}
              required
            >
              <option value="">Select…</option>
              {YEARS_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Geographic area">
            <input
              type="text"
              value={geographicArea}
              onChange={(e) => setGeographicArea(e.target.value)}
              placeholder="e.g., South Florida"
              className="w-full text-[13.5px] rounded-lg outline-none transition"
              style={{
                border: "1px solid var(--line-2)",
                padding: "9px 12px",
                color: "var(--ink)",
                backgroundColor: "white",
              }}
              required
            />
          </Field>
          <Field label="Communities managed">
            <input
              type="number"
              value={communitiesManaged}
              onChange={(e) => setCommunitiesManaged(e.target.value)}
              placeholder="e.g., 25"
              min="1"
              className="w-full text-[13.5px] rounded-lg outline-none transition"
              style={{
                border: "1px solid var(--line-2)",
                padding: "9px 12px",
                color: "var(--ink)",
                backgroundColor: "white",
              }}
              required
            />
          </Field>
        </div>

        <Field label="What sets your company apart?">
          <textarea
            value={competitiveAdvantages}
            onChange={(e) => setCompetitiveAdvantages(e.target.value)}
            placeholder="e.g., technology-forward approach, dedicated community managers, strong financial reporting…"
            rows={3}
            className="w-full text-[13.5px] rounded-lg outline-none transition resize-none"
            style={{
              border: "1px solid var(--line-2)",
              padding: "9px 12px",
              color: "var(--ink)",
              backgroundColor: "white",
              lineHeight: 1.45,
            }}
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full font-semibold text-white rounded-xl transition hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: "var(--pulse)",
            boxShadow: "var(--shadow-sm)",
            padding: "11px 18px",
            fontSize: 14,
          }}
        >
          {submitting ? "Starting interview…" : "Continue to AI interview →"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label
        className="block text-[11px] font-semibold uppercase mb-1.5"
        style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ConfirmCard({ summary, confirming, onConfirm, onAddMore }) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        padding: 22,
      }}
    >
      <h2
        className="font-medium"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          letterSpacing: "-0.015em",
          color: "var(--ink)",
        }}
      >
        Does this look right?
      </h2>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        Here's what the AI captured. Once confirmed, this becomes the brief that personalizes every
        board interview. You won't need to edit this manually.
      </p>

      <div
        className="mt-4 rounded-xl text-[13.5px] leading-relaxed whitespace-pre-line"
        style={{
          backgroundColor: "var(--paper-2)",
          color: "var(--ink-2)",
          padding: 16,
          border: "1px solid var(--line)",
        }}
      >
        {summary}
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="flex-1 font-semibold text-white rounded-xl transition hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: "var(--pulse)",
            boxShadow: "var(--shadow-sm)",
            padding: "11px 18px",
            fontSize: 14,
          }}
        >
          {confirming ? "Saving…" : "Yes, looks good"}
        </button>
        <button
          onClick={onAddMore}
          disabled={confirming}
          type="button"
          className="flex-1 font-semibold rounded-xl transition"
          style={{
            backgroundColor: "transparent",
            color: "var(--ink-2)",
            border: "1px solid var(--line-2)",
            padding: "11px 18px",
            fontSize: 14,
          }}
        >
          Let me add more
        </button>
      </div>
    </div>
  );
}

function ConfirmingOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(36,42,52,0.45)" }}
    >
      <div
        className="bg-white rounded-2xl text-center"
        style={{
          padding: "28px 24px",
          maxWidth: 360,
          width: "100%",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          className="w-9 h-9 rounded-full animate-spin mx-auto mb-3"
          style={{
            border: "3px solid var(--paper-3)",
            borderTopColor: "var(--pulse)",
          }}
        />
        <h3
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 17,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
          }}
        >
          Building your brief…
        </h3>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Generating the personalized context the AI will use for every board interview.
        </p>
      </div>
    </div>
  );
}
