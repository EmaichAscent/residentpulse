import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import HelpPanel from "../components/HelpPanel";
import TestModeToggle from "../components/TestModeToggle";

/**
 * Admin app shell — Phase 3 PR4 redesign.
 *
 * Replaces the previous cyan top-bar + pill-tabs layout with the design's
 * left-rail nav + top-bar breadcrumb pattern.
 *
 * Preserved from the prior shell:
 *   - Auth check on mount, redirect to /admin/login on failure
 *   - Logo fetched from /api/admin/account/logo (per-tenant)
 *   - TestModeToggle (live/test sandbox)
 *   - Impersonation banner + exit
 *   - Test-mode banner
 *   - Members tab bounce-count badge
 *   - Outlet context: { user, isPaidTier }
 *   - HelpPanel + legal footer
 *
 * New chrome:
 *   - Left rail with brand, ADMIN section, user card + logout
 *   - Top bar with breadcrumb (ResidentPulse > {active page})
 *   - Warm-paper background; design tokens throughout
 */
export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [bounceCount, setBounceCount] = useState(0);
  const [logoUrl, setLogoUrl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = location.pathname.replace("/admin/", "").split("/")[0] || "home";

  useEffect(() => {
    checkAuth();
    fetch("/api/admin/account/logo", { credentials: "include" })
      .then((res) => {
        if (res.ok) setLogoUrl("/api/admin/account/logo");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) loadBounceCount();
  }, [user, activeTab]);

  const loadBounceCount = async () => {
    try {
      const res = await fetch("/api/admin/board-members/bounce-count", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setBounceCount(data.bounce_count || 0);
      }
    } catch {
      // silently fail
    }
  };

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", { credentials: "include" });
      const data = await response.json();
      if (!data.authenticated || data.user.role !== "client_admin") {
        navigate("/admin/login");
      } else {
        setUser(data.user);
      }
    } catch {
      navigate("/admin/login");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      navigate("/admin/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleExitImpersonation = async () => {
    try {
      await fetch("/api/superadmin/exit-impersonation", {
        method: "POST",
        credentials: "include",
      });
      window.location.href = "/superadmin";
    } catch (err) {
      console.error("Failed to exit impersonation:", err);
    }
  };

  const handleModeChange = () => {
    window.location.reload();
  };

  const isPaidTier = user?.plan_name && user.plan_name !== "free";

  // Nav items ordered as the design specifies. `badge` is rendered in the
  // rail (Members shows the bounce count when > 0).
  const NAV_ADMIN = [
    { path: "home", label: "Home", icon: HomeIcon },
    { path: "actions", label: "Actions", icon: ActionsIcon },
    { path: "rounds", label: "Rounds", icon: RoundsIcon },
    { path: "trends", label: "Trends", icon: TrendsIcon },
    { path: "survey-data", label: "Survey data", icon: TrendsIcon },
    { path: "communities", label: "Communities", icon: CommunitiesIcon },
    { path: "members", label: "Members", icon: MembersIcon },
    { path: "account", label: "Account", icon: AccountIcon },
  ];

  const activeNavItem = NAV_ADMIN.find((n) => n.path === activeTab);
  const breadcrumbLabel = activeNavItem?.label || "Home";

  // User card data
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.email?.split("@")[0] ||
    "Loading…";
  const initials = (() => {
    if (user?.first_name || user?.last_name) {
      return `${(user.first_name || "")[0] || ""}${(user.last_name || "")[0] || ""}`.toUpperCase();
    }
    return (user?.email?.[0] || "?").toUpperCase();
  })();
  const companyName = user?.company_name || "";

  return (
    <div
      className="flex"
      style={{ height: "100vh", backgroundColor: "var(--paper)", color: "var(--ink)" }}
    >
      {/* ─── Left rail ─── */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{
          width: 248,
          backgroundColor: "var(--paper-2)",
          borderRight: "1px solid var(--line)",
        }}
        data-testid="admin-rail"
      >
        {/* Brand */}
        <div
          className="px-4 py-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName || "Company logo"}
              className="h-9 w-9 object-contain bg-white rounded p-0.5"
              style={{ border: "1px solid var(--line)" }}
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ) : (
            <div
              className="h-9 w-9 rounded flex items-center justify-center text-white"
              style={{
                background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
              }}
            >
              <PulseLogoMark />
            </div>
          )}
          <div className="min-w-0">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
            >
              ResidentPulse
            </p>
            <p
              className="text-[10.5px] uppercase tracking-wider truncate"
              style={{ color: "var(--ink-4)", letterSpacing: "0.08em" }}
            >
              {companyName || "Loading…"}
            </p>
          </div>
        </div>

        {/* Section + nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p
            className="text-[10.5px] font-semibold uppercase px-2 mt-1 mb-1.5"
            style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
          >
            Admin
          </p>
          {NAV_ADMIN.map((n) => {
            const active = activeTab === n.path;
            const Icon = n.icon;
            return (
              <button
                key={n.path}
                onClick={() => navigate(`/admin/${n.path}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition relative"
                style={{
                  backgroundColor: active ? "var(--ink)" : "transparent",
                  color: active ? "white" : "var(--ink-2)",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = "var(--paper-3)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = "transparent";
                }}
                data-testid={`nav-${n.path}`}
              >
                <span className="flex-shrink-0" style={{ opacity: active ? 1 : 0.7 }}>
                  <Icon />
                </span>
                <span className="flex-1 text-left">{n.label}</span>
                {n.path === "members" && bounceCount > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 rounded-full text-white"
                    style={{ backgroundColor: "var(--coral)", minWidth: 18, lineHeight: "16px" }}
                  >
                    {bounceCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User card */}
        <div
          className="p-3 flex items-center gap-2.5"
          style={{ borderTop: "1px solid var(--line)" }}
          data-testid="user-card"
        >
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{
              background: "linear-gradient(135deg, var(--plum), var(--plum-soft))",
              color: "var(--ink)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--ink)" }}
              title={fullName}
            >
              {fullName}
            </p>
            <button
              onClick={handleLogout}
              className="text-[11px] hover:underline"
              style={{ color: "var(--ink-3)" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main area ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Impersonation Banner */}
        {user?.impersonating && (
          <div
            className="px-6 py-2 flex items-center justify-between"
            style={{
              backgroundColor: "var(--amber-tint)",
              borderBottom: "1px solid var(--amber-soft)",
            }}
          >
            <p className="text-xs" style={{ color: "#8C5E1F" }}>
              <span className="font-semibold">Viewing as: {user.company_name}</span> (SuperAdmin
              impersonation)
            </p>
            <button
              onClick={handleExitImpersonation}
              className="text-xs font-medium underline"
              style={{ color: "#8C5E1F" }}
            >
              Exit impersonation
            </button>
          </div>
        )}

        {/* Test Mode Banner */}
        {user?.current_mode === "test" && user?.test_mode_feature && (
          <div
            className="px-6 py-2 flex items-center justify-between"
            style={{
              backgroundColor: "var(--amber-tint)",
              borderBottom: "1px solid var(--amber-soft)",
            }}
          >
            <p className="text-xs" style={{ color: "#8C5E1F" }}>
              <span className="font-semibold">Test mode</span> — sandbox data, no real emails sent.
            </p>
            <button
              onClick={() => handleModeChange("live")}
              className="text-xs font-medium underline"
              style={{ color: "#8C5E1F" }}
            >
              Switch to live mode
            </button>
          </div>
        )}

        {/* Top bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-8 py-3"
          style={{ borderBottom: "1px solid var(--line)", backgroundColor: "var(--paper)" }}
        >
          <div className="flex items-center gap-2 text-sm" data-testid="breadcrumb">
            <span style={{ color: "var(--ink-4)" }}>ResidentPulse</span>
            <ChevronRight />
            <span className="font-semibold" style={{ color: "var(--ink)" }}>
              {breadcrumbLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <TestModeToggle user={user} onModeChange={handleModeChange} />
          </div>
        </div>

        {/* Content canvas */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--paper)" }}>
          {user?.admin_role === "viewer" && (
            <div
              className="text-center"
              role="status"
              style={{
                padding: "8px 16px",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--ink-2)",
                background: "var(--paper-2)",
                borderBottom: "1px solid var(--line)",
              }}
            >
              View-only access — you can explore every dashboard and report, but changes are
              disabled. Ask your account admin to make updates.
            </div>
          )}
          <div className="max-w-5xl mx-auto px-8 py-8">
            <Outlet context={{ user, isPaidTier }} />
          </div>
          <footer
            className="max-w-5xl mx-auto px-8 py-6 mt-4"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: "var(--ink-4)" }}>
                &copy; {new Date().getFullYear()} CAM Ascent, LLC · Powered by ResidentPulse
              </span>
              <div className="flex gap-4">
                <a
                  href="/legal/terms-of-service.html"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                  style={{ color: "var(--ink-4)" }}
                >
                  Terms of Service
                </a>
                <a
                  href="/legal/privacy-policy.html"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                  style={{ color: "var(--ink-4)" }}
                >
                  Privacy Policy
                </a>
              </div>
            </div>
          </footer>
        </div>
      </main>

      <HelpPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inline icons (lucide-style strokes; matches design's icon pattern)
// ─────────────────────────────────────────────────────────────────────────

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2h-4a1 1 0 01-1-1v-5h-4v5a1 1 0 01-1 1H5a2 2 0 01-2-2z" />
    </svg>
  );
}

function ActionsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function RoundsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function TrendsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

function CommunitiesIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21V11h6v10" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg {...iconProps}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0114 0v1" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--ink-4)" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PulseLogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
      <path d="M3 12h4l2-7 4 14 2-7h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
