import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * /admin/login — full rebuild matching DESIGN/handoff/auth-spec.md.
 *
 * Two-column layout (collapses to single column under 1100px):
 *   LEFT  : brand row + pitch + form card + footer
 *   RIGHT : marketing dashboard preview — three stacked cards with
 *           presentational-only animated data (counter ticks, fake
 *           response feed, sparkline). All data is hardcoded; the
 *           preview never touches the real backend.
 *
 * Notes per Mike:
 *   • No "Live across N communities" pill in the pitch — scrubbed
 *     all "Live" references that could read as real numbers.
 *   • Google sign-in not wired yet → button is hidden (the OR divider
 *     and secondary button were removed cleanly rather than left as a
 *     stub).
 *
 * Form submit hits POST /api/auth/admin/login {email, password} and
 * redirects to /admin on success — same wire-up as before, only the
 * presentation changed.
 */
export default function ClientAdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Sign in failed. Please try again.");
        return;
      }
      navigate("/admin");
    } catch (err) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "var(--paper)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink)",
      }}
    >
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col px-6 py-8 sm:px-10 sm:py-10 lg:px-12" style={{ minWidth: 0 }}>
          <div className="mx-auto flex w-full flex-1 flex-col" style={{ maxWidth: 520 }}>
            <BrandRow />

            <div className="flex flex-1 flex-col justify-center">
              <div
                className="text-[11px] font-semibold uppercase mb-3"
                style={{ letterSpacing: "0.12em", color: "var(--ink-3)" }}
              >
                Built for HOA management
              </div>
              <h1
                className="font-normal mb-4"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 44,
                  lineHeight: 1.1,
                  letterSpacing: "-0.015em",
                  color: "var(--ink)",
                }}
              >
                The pulse of your{" "}
                <em style={{ color: "var(--pulse-deep)", fontStyle: "italic" }}>portfolio</em>, in
                real time.
              </h1>
              <p
                className="mb-8"
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "var(--ink-2)",
                  maxWidth: "38ch",
                }}
              >
                ResidentPulse is the survey &amp; sentiment platform built for HOA management — so
                you can spot dissatisfaction early, prove your value, and renew with confidence.
              </p>

              <FormCard
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                remember={remember}
                setRemember={setRemember}
                onSubmit={handleSubmit}
                submitting={submitting}
                error={error}
              />
            </div>

            <Footer />
          </div>
        </div>

        <PreviewColumn />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Left column bits
// ──────────────────────────────────────────────────────────────────────

export function BrandRow() {
  return (
    <div className="flex items-center gap-2.5 mb-12">
      <div
        className="rounded-lg flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          background: "linear-gradient(135deg, var(--ink), var(--ink-2))",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--pulse)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h4l2-7 4 14 2-7h6" />
        </svg>
      </div>
      <div>
        <div
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
            letterSpacing: "-0.005em",
          }}
        >
          Resident
          <em style={{ color: "var(--pulse-deep)", fontStyle: "italic", fontWeight: 600 }}>
            Pulse
          </em>
        </div>
        <div
          className="text-[10px] font-semibold uppercase"
          style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
        >
          A <span style={{ color: "var(--ink)" }}>CAM Ascent</span> product
        </div>
      </div>
    </div>
  );
}

function FormCard({
  email,
  setEmail,
  password,
  setPassword,
  remember,
  setRemember,
  onSubmit,
  submitting,
  error,
}) {
  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: "var(--shadow-md)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          Welcome back
        </h2>
        <SignInUpToggle current="signin" />
      </div>

      <form onSubmit={onSubmit}>
        <FieldLabel label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
            autoComplete="email"
            className="auth-input"
          />
        </FieldLabel>
        <FieldLabel label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="auth-input"
          />
        </FieldLabel>

        <div className="flex items-center justify-between mt-3 mb-4">
          <label
            className="flex items-center gap-2 text-[12.5px] cursor-pointer"
            style={{ color: "var(--ink-2)" }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: "var(--pulse)" }}
            />
            Remember me
          </label>
          <Link
            to="/admin/forgot-password"
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--pulse-deep)" }}
          >
            Forgot password?
          </Link>
        </div>

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
            padding: "12px 16px",
            fontSize: 14,
          }}
        >
          {submitting ? "Signing in…" : "Log in →"}
        </button>

        <div className="text-center text-[12.5px] mt-4" style={{ color: "var(--ink-3)" }}>
          New to ResidentPulse?{" "}
          <Link to="/admin/signup" className="font-semibold" style={{ color: "var(--pulse-deep)" }}>
            Start a free trial
          </Link>
        </div>
      </form>

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

export function SignInUpToggle({ current }) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ backgroundColor: "var(--paper-2)", border: "1px solid var(--line)" }}
    >
      <Link
        to="/admin/login"
        className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition"
        style={{
          backgroundColor: current === "signin" ? "white" : "transparent",
          color: current === "signin" ? "var(--ink)" : "var(--ink-3)",
          boxShadow: current === "signin" ? "var(--shadow-sm)" : "none",
          textDecoration: "none",
        }}
      >
        Sign in
      </Link>
      <Link
        to="/admin/signup"
        className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition"
        style={{
          backgroundColor: current === "signup" ? "white" : "transparent",
          color: current === "signup" ? "var(--ink)" : "var(--ink-3)",
          boxShadow: current === "signup" ? "var(--shadow-sm)" : "none",
          textDecoration: "none",
        }}
      >
        Sign up
      </Link>
    </div>
  );
}

export function FieldLabel({ label, children, required }) {
  return (
    <div className="mb-3">
      <label
        className="block mb-1.5 font-semibold"
        style={{ fontSize: 11.5, color: "var(--ink-2)" }}
      >
        {label}
        {required && <span style={{ color: "var(--coral)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function Footer() {
  return (
    <div
      className="flex items-center justify-between mt-8 text-[11px]"
      style={{ color: "var(--ink-4)" }}
    >
      <div className="flex gap-4">
        <span>© 2026 AscentCAM, Inc.</span>
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
      <span style={{ fontFamily: "var(--font-mono)" }}>v2.4.1</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// RIGHT — marketing preview (presentational only — no real data)
// ──────────────────────────────────────────────────────────────────────

function PreviewColumn() {
  return (
    <div
      className="hidden lg:flex flex-col items-center justify-center px-8 py-12 relative overflow-hidden"
      style={{
        backgroundColor: "var(--paper-2)",
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(31,165,113,0.08), transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(107,79,187,0.07), transparent 50%),
          repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(11,27,43,0.025) 48px),
          repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(11,27,43,0.025) 48px)
        `,
        maskImage: "radial-gradient(ellipse at center, black 60%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 60%, transparent 100%)",
      }}
    >
      <div className="w-full" style={{ maxWidth: 600 }}>
        <div
          className="text-[11px] font-semibold uppercase mb-4 flex items-center gap-2"
          style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
        >
          <span style={{ width: 24, height: 1, backgroundColor: "var(--ink-5)" }} />A glimpse of
          your dashboard
        </div>
        <div className="flex flex-col gap-5">
          <PortfolioCard />
          <FeedCard />
          <MetaRibbon />
        </div>
      </div>
    </div>
  );
}

function PortfolioCard() {
  // Counter that ticks up every 2.4s — illustrative animation only.
  // Hardcoded starting value matches the design HTML reference.
  const [count, setCount] = useState(418);
  useEffect(() => {
    const t = setInterval(() => setCount((c) => c + 1), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              color: "var(--ink)",
              letterSpacing: "-0.005em",
            }}
          >
            Portfolio
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
            72 communities · Round 4 in progress
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold rounded-full px-2 py-0.5"
          style={{
            backgroundColor: "var(--pulse-tint)",
            color: "var(--pulse-deep)",
          }}
        >
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "var(--pulse)",
              animation: "dotpulse 1.6s infinite",
            }}
          />
          In progress
        </span>
      </div>

      <div className="grid gap-0" style={{ gridTemplateColumns: "1.1fr 1fr 1fr" }}>
        <Stat label="Responses today" value={count} sub="↑ 14 in the last hour" />
        <DividerCell>
          <Stat label="Portfolio NPS" value="+47" delta="+8" sub="vs. round 3" />
        </DividerCell>
        <DividerCell>
          <Stat
            label="Response rate"
            value={
              <>
                64<span style={{ fontSize: 18, color: "var(--ink-3)" }}>%</span>
              </>
            }
            sub="of 654 invited"
          />
        </DividerCell>
      </div>

      <div className="mt-5">
        <div
          className="flex items-center justify-between mb-2 text-[10.5px] font-semibold uppercase"
          style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
        >
          <span>NPS trend · last 4 rounds</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-4)" }}>
            R1 · R2 · R3 · R4
          </span>
        </div>
        <SparklinePreview />
      </div>

      <style>{`
        @keyframes dotpulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.45 }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, sub, delta }) {
  return (
    <div>
      <div
        className="text-[10.5px] font-semibold uppercase mb-1"
        style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="inline-flex items-center text-[11px] font-semibold rounded-full"
            style={{
              backgroundColor: "var(--pulse-tint)",
              color: "var(--pulse-deep)",
              padding: "2px 7px",
            }}
          >
            {delta}
          </span>
        )}
      </div>
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function DividerCell({ children }) {
  return <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>{children}</div>;
}

function SparklinePreview() {
  return (
    <svg width="100%" height="50" viewBox="0 0 600 50" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pulse)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--pulse)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M 0 42 L 200 30 L 400 18 L 600 8 L 600 50 L 0 50 Z" fill="url(#sparkFill)" />
      <path
        d="M 0 42 L 200 30 L 400 18 L 600 8"
        fill="none"
        stroke="var(--pulse)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="600" cy="8" r="3" fill="var(--pulse)" />
    </svg>
  );
}

const SAMPLE_RESPONSES = [
  {
    name: "Magnolia Ridge",
    region: "Jacksonville",
    quote: "Best management we have had in 8 years.",
    score: 10,
  },
  {
    name: "Cypress Cove",
    region: "Miami",
    quote: "Things are good — would like more proactive updates.",
    score: 8,
  },
  {
    name: "Aspen Park",
    region: "Tampa Bay",
    quote: "Sarah is a star. Pool repairs took longer than expected.",
    score: 7,
  },
  {
    name: "Crystal Heights",
    region: "Orlando",
    quote: "Communication has been spotty this quarter.",
    score: 5,
  },
  {
    name: "Pine Square",
    region: "Ft. Lauderdale",
    quote: "Quarterly town halls are a great touch.",
    score: 9,
  },
  {
    name: "Harbor Place",
    region: "Miami",
    quote: "Great responsiveness on the recent insurance issue.",
    score: 8,
  },
  {
    name: "Oceanview Park",
    region: "Tampa Bay",
    quote: "Vendor accountability has been our biggest sticking point.",
    score: 4,
  },
  {
    name: "Birch Pines",
    region: "Jacksonville",
    quote: "Robert's monthly summaries set the standard.",
    score: 10,
  },
];

function FeedCard() {
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState(() => [
    { ...SAMPLE_RESPONSES[0], age: 0, justArrived: false },
    { ...SAMPLE_RESPONSES[1], age: 1, justArrived: false },
    { ...SAMPLE_RESPONSES[2], age: 2, justArrived: false },
  ]);
  const indexRef = useRef(3);

  useEffect(() => {
    const t1 = setInterval(() => setTick((v) => v + 1), 5000);
    const t2 = setInterval(() => {
      setRows((prev) => {
        const next = SAMPLE_RESPONSES[indexRef.current % SAMPLE_RESPONSES.length];
        indexRef.current += 1;
        return [
          { ...next, age: 0, justArrived: true },
          ...prev.slice(0, 2).map((r) => ({ ...r, justArrived: false })),
        ];
      });
    }, 5000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
            letterSpacing: "-0.005em",
          }}
        >
          Recent responses
        </div>
        <span
          className="text-[11px]"
          style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
        >
          updated {tick === 0 ? "just now" : `${tick * 5}s ago`}
        </span>
      </div>
      <div className="flex flex-col gap-3.5">
        {rows.map((r, i) => (
          <FeedRow key={`${r.name}-${i}-${tick}`} row={r} tick={tick} />
        ))}
      </div>
    </div>
  );
}

function FeedRow({ row, tick }) {
  const ageSeconds = (row.age || 0) * 30 + tick * 5;
  const ageLabel =
    ageSeconds < 60
      ? `${ageSeconds}s ago`
      : ageSeconds < 3600
        ? `${Math.floor(ageSeconds / 60)}m ago`
        : `${Math.floor(ageSeconds / 3600)}hr ago`;

  const chipBg =
    row.score >= 9
      ? "var(--pulse-tint)"
      : row.score >= 7
        ? "var(--amber-tint)"
        : "var(--coral-tint)";
  const chipColor =
    row.score >= 9 ? "var(--pulse-deep)" : row.score >= 7 ? "var(--amber)" : "var(--coral)";

  return (
    <div
      className="grid items-start gap-3"
      style={{
        gridTemplateColumns: "60px 1fr auto",
        animation: row.justArrived ? "feedfade 600ms ease-out" : "none",
        backgroundColor: row.justArrived ? "rgba(31,165,113,0.05)" : "transparent",
        borderRadius: 8,
        padding: "4px 0",
        transition: "background-color 800ms",
      }}
    >
      <span
        className="text-[11px]"
        style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
      >
        {ageLabel}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px]" style={{ color: "var(--ink)" }}>
          <span className="font-semibold">{row.name}</span>{" "}
          <span style={{ color: "var(--ink-4)" }}>· {row.region}</span>
        </div>
        <div
          className="text-[11.5px] mt-0.5 italic truncate"
          style={{ color: "var(--ink-3)" }}
          title={row.quote}
        >
          "{row.quote}"
        </div>
      </div>
      <span
        className="inline-flex items-center justify-center font-semibold rounded-md"
        style={{
          width: 36,
          height: 24,
          backgroundColor: chipBg,
          color: chipColor,
          fontSize: 12,
        }}
      >
        {row.score}
      </span>
      <style>{`
        @keyframes feedfade {
          0% { opacity: 0; transform: translateY(-8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function MetaRibbon() {
  return (
    <div
      className="rounded-2xl bg-white px-6 py-4 grid"
      style={{
        gridTemplateColumns: "1fr 1fr 1fr",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--line)",
      }}
    >
      <RibbonCell label="In flight" value="3 rounds" />
      <RibbonCell label="Detractor alerts" value="2 today" valueColor="var(--coral)" />
      <RibbonCell label="Avg. completion" value="3m 12s" />
    </div>
  );
}

function RibbonCell({ label, value, valueColor }) {
  return (
    <div>
      <div
        className="text-[10.5px] font-semibold uppercase mb-0.5"
        style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
      >
        {label}
      </div>
      <div
        className="font-semibold"
        style={{
          fontSize: 15,
          color: valueColor || "var(--ink)",
          fontFamily: "var(--font-display)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
