import { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

/**
 * SuperAdmin shell — dark left sidebar nav + main content area, per
 * the design handoff screenshot. Replaces the previous blue-header +
 * gray-pill-tabs layout.
 *
 * Sidebar:
 *   • Logo + "SuperAdmin" subtitle at top
 *   • OPERATIONS section: Dashboard / Clients / Prompts / Settings
 *     with live count badges (signals_count, clients_count) pulled
 *     from /today-stack on mount.
 *   • Active item gets the pulse-green pill background.
 *   • User pill at the bottom with name + role + a small Logout link.
 *
 * Main content:
 *   • Subtle "SuperAdmin / {section}" breadcrumb at the very top.
 *   • <Outlet /> renders the active page underneath.
 *
 * Resources section (System log / Audit trail) from the design isn't
 * wired here — those routes don't exist yet. Easy to add when they do.
 */

const NAV_OPERATIONS = [
  { path: "dashboard", label: "Dashboard", icon: "grid", badgeKey: "signals" },
  { path: "clients", label: "Clients", icon: "users", badgeKey: "clients" },
  { path: "prompts", label: "Prompts", icon: "chat" },
  { path: "settings", label: "Settings", icon: "gear" },
];

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [badges, setBadges] = useState({ signals: null, clients: null });

  const activeTab = location.pathname.replace("/superadmin/", "").split("/")[0] || "dashboard";

  useEffect(() => {
    checkAuth();
  }, []);

  // Refresh badge counts whenever the user lands on a new tab — keeps
  // them honest if the operator just edited a prompt or finalized a
  // session and is bouncing back to the dashboard.
  useEffect(() => {
    loadBadges();
  }, [activeTab]);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", { credentials: "include" });
      const data = await response.json();
      if (!data.authenticated || data.user.role !== "superadmin") {
        navigate("/superadmin/login");
        return;
      }
      setUser(data.user);
    } catch (_err) {
      navigate("/superadmin/login");
    }
  };

  const loadBadges = async () => {
    try {
      const res = await fetch("/api/superadmin/today-stack", { credentials: "include" });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) return;
      const data = await res.json();
      setBadges({
        signals: data?.header?.signals_count ?? null,
        clients: data?.header?.clients_count ?? null,
      });
    } catch {
      // Silent — badges are decorative; the page still works without them.
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      navigate("/superadmin/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const activeLabel = NAV_OPERATIONS.find((n) => n.path === activeTab)?.label || "Dashboard";

  return (
    <div
      className="flex"
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        style={{
          width: 240,
          background: "var(--ink)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Logo block */}
        <div className="flex items-center gap-2.5" style={{ padding: "20px 18px 24px" }}>
          <span
            className="rounded-lg flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 18,
              color: "white",
            }}
            aria-hidden="true"
          >
            R
          </span>
          <div className="flex flex-col">
            <span
              className="font-semibold"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                letterSpacing: "-0.01em",
                color: "white",
                lineHeight: 1.05,
              }}
            >
              ResidentPulse
            </span>
            <span
              className="font-bold uppercase"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.45)",
                marginTop: 2,
              }}
            >
              SuperAdmin
            </span>
          </div>
        </div>

        {/* OPERATIONS section */}
        <SidebarSection label="Operations" />
        <nav className="flex flex-col" style={{ padding: "0 10px 16px", gap: 2 }}>
          {NAV_OPERATIONS.map((n) => (
            <NavItem
              key={n.path}
              icon={n.icon}
              label={n.label}
              active={activeTab === n.path}
              badge={n.badgeKey ? badges[n.badgeKey] : null}
              onClick={() => navigate(`/superadmin/${n.path}`)}
            />
          ))}
        </nav>

        {/* Spacer pushes the user pill to the bottom */}
        <div style={{ flex: 1 }} />

        {/* User pill */}
        <div
          style={{
            margin: 12,
            padding: "10px 12px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            className="rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              width: 32,
              height: 32,
              background: "rgba(255,255,255,0.12)",
              fontSize: 11,
              fontWeight: 700,
              color: "white",
              letterSpacing: "0.04em",
            }}
            aria-hidden="true"
          >
            {initialsFor(user)}
          </div>
          <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
            <span
              className="font-semibold"
              style={{
                fontSize: 12.5,
                color: "white",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user?.email?.split("@")[0] || "SuperAdmin"}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-left transition"
              style={{
                fontSize: 10.5,
                color: "rgba(255,255,255,0.55)",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                marginTop: 1,
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Breadcrumb strip */}
        <div
          className="flex items-center"
          style={{
            padding: "16px 32px",
            borderBottom: "1px solid var(--line)",
            background: "white",
            gap: 8,
          }}
        >
          <span className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
            SuperAdmin
          </span>
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {activeLabel}
          </span>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, padding: "28px 32px 64px" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────

function SidebarSection({ label }) {
  return (
    <div
      className="font-bold uppercase"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.18em",
        color: "rgba(255,255,255,0.4)",
        padding: "4px 22px 8px",
      }}
    >
      {label}
    </div>
  );
}

function NavItem({ icon, label, active, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center transition"
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: active ? "var(--pulse)" : "transparent",
        color: active ? "white" : "rgba(255,255,255,0.72)",
        border: "none",
        cursor: "pointer",
        gap: 10,
        textAlign: "left",
        fontWeight: active ? 600 : 500,
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <NavIcon name={icon} active={active} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span
          className="font-semibold"
          style={{
            fontSize: 10.5,
            padding: "1px 7px",
            borderRadius: 999,
            background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)",
            color: active ? "white" : "rgba(255,255,255,0.85)",
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function NavIcon({ name }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  switch (name) {
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "gear":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

function initialsFor(user) {
  if (!user) return "··";
  const src = user.email || "";
  const local = src.split("@")[0] || "su";
  // First char + first char after a separator (or 2nd char fallback).
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}
