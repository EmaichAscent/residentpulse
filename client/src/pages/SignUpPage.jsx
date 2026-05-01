import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandRow, FieldLabel } from "./ClientAdminLoginPage";

/**
 * /admin/signup — full rebuild matching DESIGN/handoff/auth-spec.md.
 *
 * Layout (collapses to single column under 1024px):
 *   LEFT  : sticky 360px rail — brand, pitch, 4-step progress, legal
 *   RIGHT : scrollable main (max 920px centered):
 *             01 · Choose your plan (6 tiles, 3-col grid)
 *             02 · Company information (2-col form)
 *             03 · Create your admin account (2-col form)
 *             — selected plan summary card —
 *             [ Create my workspace → ] + legal microcopy
 *
 * Flow: POST /api/signup/register with the full body. Free plan →
 * email verification screen. Paid plan → redirect to the Zoho
 * checkout URL the endpoint returns. The /register endpoint already
 * handles both cases — only the page presentation changed.
 *
 * New field per Mike's directive: # of communities you manage —
 * optional bucket dropdown that persists to clients.community_count_estimate.
 */
export default function SignUpPage() {
  const navigate = useNavigate();

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  // Company info
  const [companyName, setCompanyName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [communityCountEstimate, setCommunityCountEstimate] = useState("");

  // Admin account
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/signup/plans")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        setPlans(Array.isArray(list) ? list : []);
        // Default-select the Free plan per the spec.
        const free = (Array.isArray(list) ? list : []).find((p) => p.name === "free");
        if (free) setSelectedPlanId(free.id);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation. Server re-validates so this is just UX.
    if (!selectedPlanId) {
      setError("Pick a plan above.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'/`~]/.test(password)) {
      setError("Password must include a number and a symbol.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/signup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim() || null,
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
          phone_number: phoneNumber.trim(),
          admin_first_name: firstName.trim() || null,
          admin_last_name: lastName.trim() || null,
          admin_email: adminEmail.trim().toLowerCase(),
          password,
          plan_id: selectedPlanId,
          community_count_estimate: communityCountEstimate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Paid plan: redirect to Zoho checkout. The /register endpoint
      // already creates the checkout session and returns the URL.
      if (data.requires_payment && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      // Free plan: show success screen.
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return <SignupSuccess email={adminEmail} navigate={navigate} />;
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "var(--paper)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink)",
      }}
    >
      <div className="grid min-h-screen" style={{ gridTemplateColumns: "360px 1fr" }}>
        <LeftRail />

        <main className="px-12 py-10 mx-auto w-full" style={{ maxWidth: 920 }}>
          <div className="flex items-center justify-between mb-3">
            <div
              className="text-[11px] font-semibold uppercase"
              style={{ letterSpacing: "0.12em", color: "var(--ink-3)" }}
            >
              Get started · free trial
            </div>
            <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Already have an account?{" "}
              <Link
                to="/admin/login"
                className="font-semibold"
                style={{ color: "var(--pulse-deep)" }}
              >
                Log in
              </Link>
            </div>
          </div>

          <h1
            className="font-normal mb-8"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            Create your workspace
          </h1>
          <p className="text-[14px] mb-6" style={{ color: "var(--ink-2)" }}>
            Three quick sections — plan, company, account. We'll have you up and running in minutes.
          </p>

          <form onSubmit={handleSubmit}>
            {/* 01 — Plans */}
            <SectionHeading number="01" title="Choose your plan">
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)", fontWeight: 400 }}>
                All plans include 4 survey rounds/year unless noted.
              </span>
            </SectionHeading>
            {loadingPlans ? (
              <p className="text-[13px] mb-6" style={{ color: "var(--ink-4)" }}>
                Loading plans…
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 mb-8">
                {plans.map((p) => (
                  <PlanTile
                    key={p.id}
                    plan={p}
                    selected={selectedPlanId === p.id}
                    onSelect={() => setSelectedPlanId(p.id)}
                  />
                ))}
              </div>
            )}

            {/* 02 — Company */}
            <SectionHeading number="02" title="Company information">
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                This appears on surveys and invitations.
              </span>
            </SectionHeading>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <FieldLabel label="Management company name" required>
                <input
                  className="auth-input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Coastal Community Management"
                  required
                />
              </FieldLabel>
              <FieldLabel label="Phone number" required>
                <input
                  className="auth-input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="(555) 123-4567"
                  type="tel"
                  required
                />
              </FieldLabel>
            </div>
            <FieldLabel label="Address line 1" required>
              <input
                className="auth-input"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="100 Main Street"
                required
              />
            </FieldLabel>
            <FieldLabel label="Address line 2 (optional)">
              <input
                className="auth-input"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Suite, floor, etc."
              />
            </FieldLabel>
            <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <FieldLabel label="City" required>
                <input
                  className="auth-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Safety Harbor"
                  required
                />
              </FieldLabel>
              <FieldLabel label="State" required>
                <input
                  className="auth-input"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="FL"
                  maxLength={2}
                  required
                />
              </FieldLabel>
              <FieldLabel label="ZIP code" required>
                <input
                  className="auth-input"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="34695"
                  required
                />
              </FieldLabel>
            </div>
            <FieldLabel label="# of communities you manage (optional)">
              <select
                className="auth-select"
                value={communityCountEstimate}
                onChange={(e) => setCommunityCountEstimate(e.target.value)}
              >
                <option value="">— Select —</option>
                <option value="1-10">1-10</option>
                <option value="10-50">10-50</option>
                <option value="50-100">50-100</option>
                <option value="80-100">80-100</option>
                <option value="100-250">100-250</option>
                <option value="250+">250+</option>
              </select>
            </FieldLabel>

            {/* 03 — Admin account */}
            <SectionHeading number="03" title="Create your admin account">
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                You'll be the workspace owner.
              </span>
            </SectionHeading>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <FieldLabel label="First name" required>
                <input
                  className="auth-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Mike"
                  required
                />
              </FieldLabel>
              <FieldLabel label="Last name" required>
                <input
                  className="auth-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Hardy"
                  required
                />
              </FieldLabel>
            </div>
            <FieldLabel label="Email" required>
              <input
                className="auth-input"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@yourcompany.com"
                type="email"
                required
                autoComplete="email"
              />
            </FieldLabel>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <FieldLabel label="Password" required>
                <input
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </FieldLabel>
              <FieldLabel label="Confirm password" required>
                <input
                  className="auth-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </FieldLabel>
            </div>
            <p className="text-[11.5px] mb-6" style={{ color: "var(--ink-4)" }}>
              8+ characters with a number and symbol.
            </p>

            {/* Plan summary + submit */}
            {selectedPlan && (
              <div
                className="rounded-xl p-4 mb-4 flex items-center justify-between"
                style={{
                  backgroundColor: "var(--paper-2)",
                  border: "1px solid var(--line)",
                }}
              >
                <div>
                  <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    <span className="font-semibold">Selected plan:</span>{" "}
                    {selectedPlan.display_name}{" "}
                    <span style={{ color: "var(--ink-4)" }}>
                      {selectedPlan.price_cents
                        ? `· $${selectedPlan.price_cents / 100}/mo`
                        : "· No card required"}
                    </span>
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                    Up to {selectedPlan.member_limit} board members ·{" "}
                    {selectedPlan.survey_rounds_per_year} survey rounds / year
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    document
                      .querySelector("[data-section='01']")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--pulse-deep)" }}
                >
                  Change plan
                </button>
              </div>
            )}

            {error && (
              <div
                className="mb-3 px-3 py-2 rounded-lg text-[12.5px]"
                style={{
                  backgroundColor: "var(--coral-tint)",
                  color: "var(--coral)",
                  border: "1px solid var(--coral-soft)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full font-semibold rounded-lg transition disabled:opacity-50"
              style={{
                backgroundColor: "var(--pulse)",
                color: "white",
                padding: "14px 16px",
                fontSize: 14.5,
              }}
            >
              {submitting ? "Creating workspace…" : "Create my workspace →"}
            </button>

            <p className="text-center mt-4 text-[11.5px]" style={{ color: "var(--ink-4)" }}>
              By creating an account, you agree to our{" "}
              <a href="#" style={{ color: "var(--ink-3)", textDecoration: "underline" }}>
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" style={{ color: "var(--ink-3)", textDecoration: "underline" }}>
                Privacy Policy
              </a>
              .<br />
              <span style={{ color: "var(--ink-5)" }}>* Required field</span>
            </p>
          </form>
        </main>
      </div>

      {/* Reuse the auth-input / auth-select styles from the login page
            via inline injection — keeps the auth pages decoupled from
            global CSS. */}
      <style>{`
        .auth-input {
          width: 100%;
          padding: 10px 12px;
          font-size: 13.5px;
          color: var(--ink);
          background: white;
          border: 1px solid var(--line-2);
          border-radius: 8px;
          outline: none;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .auth-input:focus {
          border-color: var(--pulse);
          box-shadow: 0 0 0 3px rgba(31,165,113,0.15);
        }
        .auth-select {
          width: 100%;
          padding: 10px 12px;
          font-size: 13.5px;
          color: var(--ink);
          background: white;
          border: 1px solid var(--line-2);
          border-radius: 8px;
          outline: none;
          cursor: pointer;
        }
        .auth-select:focus {
          border-color: var(--pulse);
          box-shadow: 0 0 0 3px rgba(31,165,113,0.15);
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Left rail — sticky pitch + steps
// ──────────────────────────────────────────────────────────────────────

function LeftRail() {
  return (
    <aside
      className="px-10 py-10 flex flex-col"
      style={{
        position: "sticky",
        top: 0,
        height: "100vh",
        borderRight: "1px solid var(--line)",
        backgroundColor: "var(--paper)",
      }}
    >
      <BrandRow />

      <div className="flex-1">
        <div
          className="text-[11px] font-semibold uppercase mb-3"
          style={{ letterSpacing: "0.12em", color: "var(--ink-3)" }}
        >
          Built for HOA management
        </div>
        <h1
          className="font-normal mb-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Start with{" "}
          <em style={{ color: "var(--pulse-deep)", fontStyle: "italic" }}>Free Forever</em>. Upgrade
          when you grow.
        </h1>
        <p
          className="mb-8"
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--ink-2)",
          }}
        >
          No credit card required. Set up in under 5 minutes — invite your first board members
          today.
        </p>

        <ol className="flex flex-col gap-3.5 relative">
          {[
            {
              n: 1,
              title: "Choose a plan",
              sub: "Right-size for your portfolio.",
              state: "active",
            },
            {
              n: 2,
              title: "Tell us about your company",
              sub: "Used on surveys & invitations.",
              state: "active",
            },
            {
              n: 3,
              title: "Create your admin account",
              sub: "You'll be the workspace owner.",
              state: "active",
            },
            { n: 4, title: "Confirm & sign in", sub: "Land on your dashboard.", state: "pending" },
          ].map((s, i, arr) => (
            <Step key={s.n} step={s} isLast={i === arr.length - 1} />
          ))}
        </ol>
      </div>

      <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
        Already have an account?{" "}
        <Link to="/admin/login" className="font-semibold" style={{ color: "var(--pulse-deep)" }}>
          Log in
        </Link>
        <div className="flex gap-3 mt-2">
          <a href="#" style={{ color: "var(--ink-4)" }}>
            Privacy
          </a>
          <a href="#" style={{ color: "var(--ink-4)" }}>
            Terms
          </a>
          <a href="#" style={{ color: "var(--ink-4)" }}>
            Status
          </a>
        </div>
      </div>
    </aside>
  );
}

function Step({ step, isLast }) {
  const fill =
    step.state === "active" ? "var(--ink)" : step.state === "done" ? "var(--pulse)" : "transparent";
  const border = step.state === "pending" ? "1.5px solid var(--line-2)" : "none";
  const color = step.state === "pending" ? "var(--ink-4)" : "white";
  return (
    <li className="flex gap-3 items-start relative">
      <div
        className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
        style={{
          width: 24,
          height: 24,
          backgroundColor: fill,
          color,
          fontSize: 11,
          border,
          zIndex: 1,
        }}
      >
        {step.n}
      </div>
      {!isLast && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 11,
            top: 24,
            bottom: -14,
            width: 2,
            backgroundColor: "var(--line)",
          }}
        />
      )}
      <div>
        <div
          className="font-semibold text-[13px]"
          style={{ color: step.state === "pending" ? "var(--ink-3)" : "var(--ink)" }}
        >
          {step.title}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
          {step.sub}
        </div>
      </div>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Section + plan tiles
// ──────────────────────────────────────────────────────────────────────

function SectionHeading({ number, title, children }) {
  return (
    <div
      className="flex items-center justify-between mb-4 mt-2"
      data-section={number}
      style={{ borderTop: "1px solid var(--line)", paddingTop: 22 }}
    >
      <h2 className="flex items-center gap-3">
        <span
          className="font-mono font-semibold"
          style={{ fontSize: 12, color: "var(--ink-4)", letterSpacing: "0.04em" }}
        >
          {number}
        </span>
        <span
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </span>
      </h2>
      {children}
    </div>
  );
}

function PlanTile({ plan, selected, onSelect }) {
  const isFree = plan.name === "free";
  const isMostPopular = plan.name === "growth-1000";
  const badge = isFree
    ? { label: "START HERE", bg: "var(--pulse)", color: "white" }
    : isMostPopular
      ? { label: "MOST POPULAR", bg: "var(--ink)", color: "white" }
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-2xl bg-white text-left transition relative"
      style={{
        padding: "16px 18px",
        border: selected ? "2px solid var(--pulse)" : "1px solid var(--line)",
        backgroundColor: selected ? "var(--pulse-tint)" : "white",
        boxShadow: selected ? "0 0 0 1px var(--pulse)" : "none",
        cursor: "pointer",
      }}
    >
      {badge && (
        <span
          className="absolute font-bold uppercase"
          style={{
            top: -10,
            right: 14,
            backgroundColor: badge.bg,
            color: badge.color,
            fontSize: 9.5,
            letterSpacing: "0.08em",
            padding: "3px 8px",
            borderRadius: 4,
          }}
        >
          {badge.label}
        </span>
      )}
      <div className="flex items-start justify-between mb-1">
        <span
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
            letterSpacing: "-0.005em",
          }}
        >
          {plan.display_name}
        </span>
        <span
          className="rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            width: 18,
            height: 18,
            border: selected ? "none" : "1.5px solid var(--line-2)",
            backgroundColor: selected ? "var(--pulse)" : "transparent",
          }}
        >
          {selected && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      </div>
      <div className="text-[11.5px] mb-2" style={{ color: "var(--ink-3)", lineHeight: 1.45 }}>
        Up to <strong style={{ color: "var(--ink-2)" }}>{plan.member_limit}</strong> board members ·{" "}
        <strong style={{ color: "var(--ink-2)" }}>
          {plan.survey_rounds_per_year} survey rounds
        </strong>{" "}
        / year
      </div>
      <div>
        {plan.price_cents != null && plan.price_cents > 0 ? (
          <span style={{ color: "var(--ink)" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              ${plan.price_cents / 100}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
              {" "}
              /mo
            </span>
          </span>
        ) : (
          <span className="font-semibold text-[12px]" style={{ color: "var(--pulse-deep)" }}>
            Free Forever
          </span>
        )}
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Free-plan success screen
// ──────────────────────────────────────────────────────────────────────

function SignupSuccess({ email, navigate }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: "var(--paper)", fontFamily: "var(--font-sans)" }}
    >
      <div
        className="rounded-2xl bg-white p-10 max-w-md w-full text-center"
        style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--line)" }}
      >
        <div
          className="rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            backgroundColor: "var(--pulse-tint)",
            color: "var(--pulse-deep)",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h1
          className="font-medium mb-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            color: "var(--ink)",
            letterSpacing: "-0.015em",
          }}
        >
          Check your inbox
        </h1>
        <p className="text-[13.5px] mb-5" style={{ color: "var(--ink-3)" }}>
          We sent a verification link to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
          Click the link to confirm your email and finish setting up your workspace.
        </p>
        <button
          onClick={() => navigate("/admin/login")}
          className="w-full font-semibold rounded-lg transition"
          style={{
            backgroundColor: "var(--pulse)",
            color: "white",
            padding: "12px 16px",
            fontSize: 14,
          }}
        >
          Back to sign in
        </button>
        <p className="text-[11.5px] mt-4" style={{ color: "var(--ink-4)" }}>
          Didn't get it? Check spam, or contact support@residentpulse.ai.
        </p>
      </div>
    </div>
  );
}
