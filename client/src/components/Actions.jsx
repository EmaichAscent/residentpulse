import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import ActionDrawer from "./ActionDrawer";
import ConfirmModal from "./ConfirmModal";

/**
 * Actions — the strategic centerpiece of the redesign.
 *
 * Three bands top-to-bottom:
 *   1. This Quarter's Brief: 1–3 ranked picks the AI surfaced from the
 *      latest concluded round.
 *   2. What we've done: filterable journal of logged actions.
 *   3. All themes: long-tail list of recommendations not in the brief,
 *      each loggable.
 *
 * Closed-loop is intentional: actions are {what, who, free-text note,
 * optional status}. No SLAs, due dates, notifications. The real payoff is
 * the next round's resident chat referencing what's been done — that
 * wiring is its own future PR.
 */
export default function Actions() {
  const { user } = useOutletContext();
  const [actions, setActions] = useState([]);
  const [brief, setBrief] = useState({ round: null, picks: [], total_respondents: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerSeed, setDrawerSeed] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "mine" | "completed"
  const [completeTarget, setCompleteTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, bRes] = await Promise.all([
        fetch("/api/admin/actions", { credentials: "include" }),
        fetch("/api/admin/actions/brief", { credentials: "include" }),
      ]);
      if (!aRes.ok) throw new Error("Failed to load actions");
      if (!bRes.ok) throw new Error("Failed to load brief");
      setActions(await aRes.json());
      setBrief(await bRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateAction = async (id, patch) => {
    try {
      const res = await fetch(`/api/admin/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Update failed");
      }
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteAction = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/actions/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      alert(err.message);
      setDeleteTarget(null);
    }
  };

  const filteredActions = actions.filter((a) => {
    if (filter === "mine") return a.owner_email === user?.email;
    if (filter === "completed") return a.status === "completed";
    return true;
  });

  // Accept/reject decisions on brief picks. Same backend as the
  // Round Results dashboard and Rounds landing page (POST/DELETE
  // /api/admin/actions/decisions). Optimistic local update flips the
  // UI immediately; a follow-up `load()` reconciles with whatever
  // the brief endpoint returns.
  const handleDecision = async (theme, decision) => {
    if (!brief.round || !theme) return;
    try {
      const res = await fetch("/api/admin/actions/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ round_id: brief.round.id, theme, decision }),
      });
      if (res.ok) {
        setBrief((prev) => ({
          ...prev,
          picks: prev.picks.map((p) =>
            p.theme === theme ? { ...p, decision, decided_at: new Date().toISOString() } : p
          ),
        }));
      }
    } catch (err) {
      console.error("Failed to record decision:", err);
    }
  };

  const handleUndoDecision = async (theme) => {
    if (!brief.round || !theme) return;
    try {
      const res = await fetch("/api/admin/actions/decisions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ round_id: brief.round.id, theme }),
      });
      if (res.ok) {
        setBrief((prev) => ({
          ...prev,
          picks: prev.picks.map((p) =>
            p.theme === theme ? { ...p, decision: null, decided_at: null } : p
          ),
        }));
      }
    } catch (err) {
      console.error("Failed to undo decision:", err);
    }
  };

  if (loading) {
    return (
      <p
        className="text-center py-10"
        style={{ color: "var(--ink-4)" }}
        data-testid="actions-loading"
      >
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-center py-10 text-red-500" data-testid="actions-error">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
          style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
        >
          {brief.round
            ? `Round ${brief.round.round_number} · ${brief.picks.length} picks`
            : "No brief yet"}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Actions
        </h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--ink-3)" }}>
          The fewest, biggest moves your organization can make this quarter to lift sentiment across
          the portfolio. Optional. Skippable. We track what you log so we can tell residents about
          it next round.
        </p>
      </div>

      {/* ─── Band 1 — This Quarter's Brief ─── */}
      <section>
        <SectionHeader>This quarter's brief</SectionHeader>
        {brief.picks.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              No picks yet. The brief generates from the AI insights of the most recent concluded
              round. Conclude a round with insights to see picks here.
            </p>
          </Card>
        ) : (
          <div className="mt-3 space-y-3">
            {brief.picks.map((pick) => {
              const loggedAction = actions.find((a) => a.theme === pick.theme);
              return (
                <BriefPick
                  key={pick.theme}
                  pick={pick}
                  loggedAction={loggedAction}
                  totalRespondents={brief.total_respondents}
                  onAccept={() => handleDecision(pick.theme, "accepted")}
                  onReject={() => handleDecision(pick.theme, "rejected")}
                  onUndoDecision={() => handleUndoDecision(pick.theme)}
                  onConfigure={() =>
                    setDrawerSeed({
                      theme: pick.theme,
                      title: pick.theme,
                      details:
                        [pick.summary, pick.rationale].filter(Boolean).join(" · ") ||
                        (brief.round ? `Round ${brief.round.round_number} · ` : "") +
                          "Generated from AI insights.",
                    })
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Band 2 — What we've done ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader>What we've done</SectionHeader>
          <div className="flex gap-1.5 text-xs">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({actions.length})
            </FilterChip>
            <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>
              Mine ({actions.filter((a) => a.owner_email === user?.email).length})
            </FilterChip>
            <FilterChip active={filter === "completed"} onClick={() => setFilter("completed")}>
              Completed ({actions.filter((a) => a.status === "completed").length})
            </FilterChip>
          </div>
        </div>

        {filteredActions.length === 0 ? (
          <Card>
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              {actions.length === 0
                ? "Nothing logged yet. Log an action above and it lands here."
                : "Nothing matches this filter."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredActions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                onComplete={() => setCompleteTarget(action)}
                onReopen={() => updateAction(action.id, { status: "in_progress" })}
                onDelete={() => setDeleteTarget(action)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Drawer (lazy-rendered when open) ─── */}
      <ActionDrawer
        isOpen={!!drawerSeed}
        seed={drawerSeed}
        ownerDefault={user?.email}
        onClose={() => setDrawerSeed(null)}
        onSaved={() => {
          setDrawerSeed(null);
          load();
        }}
      />

      {/* ─── Confirm modals ─── */}
      <ConfirmModal
        isOpen={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        onConfirm={() => {
          updateAction(completeTarget.id, { status: "completed" });
          setCompleteTarget(null);
        }}
        title="Mark as completed"
        message={
          completeTarget
            ? `Mark "${completeTarget.title}" as completed?\n\nYou can reopen it later if needed.`
            : ""
        }
        confirmLabel="Mark completed"
      />
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteAction}
        title="Delete action"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.title}"?\n\nThis removes the entry permanently.`
            : ""
        }
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────

/**
 * Brief pick — Accept/Reject + NPS lift, matching the Round Results
 * page's recommendation row exactly. Three states:
 *
 *   • No decision yet → Accept (primary) / Reject buttons
 *   • Accepted, no logged action → "Configure & assign →" + Change my mind
 *   • Logged → "Action logged" pill (status: in progress / completed)
 *   • Rejected → muted row with Undo
 *
 * NPS lift uses the same conservative model as Round Results:
 *   lift_pts = 0.5 × affected_detractors / total_respondents × 100
 */
function BriefPick({
  pick,
  loggedAction,
  totalRespondents,
  onAccept,
  onReject,
  onUndoDecision,
  onConfigure,
}) {
  const decision = pick.decision;
  const isAccepted = decision === "accepted";
  const isRejected = decision === "rejected";
  const isLogged = !!loggedAction;

  const lift =
    typeof pick.affected_detractor_count === "number" && totalRespondents > 0
      ? Math.round((0.5 * pick.affected_detractor_count * 100) / totalRespondents)
      : null;

  const priorityLabel =
    pick.priority === "high"
      ? "HIGH PRIORITY"
      : pick.priority === "medium"
        ? "MEDIUM"
        : pick.priority === "low"
          ? "LOW"
          : pick.priority === "keep_doing"
            ? "KEEP DOING"
            : null;
  const priorityColor =
    pick.priority === "high"
      ? "var(--coral)"
      : pick.priority === "keep_doing"
        ? "var(--pulse-deep)"
        : pick.priority === "medium"
          ? "var(--amber)"
          : "var(--ink-4)";

  return (
    <div
      className="rounded-xl border overflow-hidden flex"
      style={{
        borderColor: "var(--line)",
        backgroundColor: "white",
        opacity: isRejected ? 0.55 : 1,
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center px-6 py-4"
        style={{ backgroundColor: "var(--ink)", color: "white", minWidth: 80 }}
      >
        <div className="text-center">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ letterSpacing: "0.15em" }}
          >
            Pick
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            {pick.rank}
          </div>
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {priorityLabel && (
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: priorityColor, letterSpacing: "0.08em" }}
            >
              {priorityLabel}
            </span>
          )}
          {isLogged ? (
            <span
              className="text-[10.5px] font-bold uppercase rounded-full px-2 py-0.5"
              style={{
                backgroundColor: "var(--pulse-tint)",
                color: "var(--pulse-deep)",
                letterSpacing: "0.06em",
              }}
            >
              ✓ {loggedAction.status === "completed" ? "Completed" : "In progress"}
            </span>
          ) : isAccepted ? (
            <span
              className="text-[10.5px] font-bold uppercase rounded-full px-2 py-0.5"
              style={{
                backgroundColor: "var(--pulse-tint)",
                color: "var(--pulse-deep)",
                letterSpacing: "0.06em",
              }}
            >
              ✓ Accepted
            </span>
          ) : isRejected ? (
            <span
              className="text-[10.5px] font-bold uppercase rounded-full px-2 py-0.5"
              style={{
                backgroundColor: "var(--paper-3)",
                color: "var(--ink-3)",
                letterSpacing: "0.06em",
              }}
            >
              Rejected
            </span>
          ) : (
            <span
              className="text-[10.5px] font-bold uppercase rounded-full px-2 py-0.5"
              style={{
                backgroundColor: "var(--coral-tint)",
                color: "var(--coral)",
                letterSpacing: "0.06em",
              }}
            >
              Pending decision
            </span>
          )}
          {lift != null && lift > 0 && !isRejected && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full"
              style={{
                backgroundColor: "var(--pulse-tint)",
                color: "var(--pulse-deep)",
                padding: "2px 8px",
              }}
              title={`Conservative projection: ${pick.affected_detractor_count} detractors mentioned this. Assumes 50% convert from detractor → passive when the issue is addressed.`}
            >
              ↑ +{lift} NPS projected
            </span>
          )}
        </div>
        <h3
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            color: "var(--ink)",
            marginBottom: 6,
          }}
        >
          {pick.theme}
        </h3>
        {pick.summary && (
          <p className="text-sm mb-2" style={{ color: "var(--ink-2)" }}>
            {pick.summary}
          </p>
        )}
        {lift != null && pick.affected_detractor_count != null && !isRejected && (
          <div className="text-[11px] mb-3" style={{ color: "var(--ink-4)" }}>
            Based on {pick.affected_detractor_count} detractors of {totalRespondents} respondents ·
            50% conversion to passive
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {isLogged ? (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ backgroundColor: "var(--pulse-tint)", color: "var(--pulse-deep)" }}
            >
              Action logged
            </span>
          ) : isRejected ? (
            <button
              onClick={onUndoDecision}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
              style={{
                backgroundColor: "white",
                color: "var(--ink-2)",
                border: "1px solid var(--line-2)",
              }}
            >
              Undo
            </button>
          ) : isAccepted ? (
            <>
              <button
                onClick={onConfigure}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition"
                style={{ backgroundColor: "var(--pulse)" }}
              >
                Configure &amp; assign →
              </button>
              <button
                onClick={onUndoDecision}
                className="text-[11px] underline"
                style={{ color: "var(--ink-4)" }}
              >
                Change my mind
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onAccept}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition"
                style={{ backgroundColor: "var(--pulse)" }}
              >
                Accept
              </button>
              <button
                onClick={onReject}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
                style={{
                  backgroundColor: "white",
                  color: "var(--ink-2)",
                  border: "1px solid var(--line-2)",
                }}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionRow({ action, onComplete, onReopen, onDelete }) {
  const isCompleted = action.status === "completed";
  return (
    <div
      className="flex items-start justify-between gap-4 px-4 py-3 rounded-lg border transition"
      style={{
        borderColor: "var(--line)",
        backgroundColor: isCompleted ? "var(--paper-2)" : "white",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: isCompleted ? "var(--leaf-tint)" : "var(--paper-3)",
              color: isCompleted ? "var(--pulse-deep)" : "var(--ink-3)",
              letterSpacing: "0.08em",
            }}
          >
            {isCompleted ? "✓ Completed" : "In progress"}
          </span>
          <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
            {action.theme}
          </span>
        </div>
        <p
          className="text-sm font-medium"
          style={{
            color: isCompleted ? "var(--ink-3)" : "var(--ink)",
            textDecoration: isCompleted ? "line-through" : "none",
          }}
        >
          {action.title}
        </p>
        {action.details && (
          <p className="text-xs mt-1 leading-snug" style={{ color: "var(--ink-3)" }}>
            {action.details}
          </p>
        )}
        <p className="text-[11px] mt-1.5" style={{ color: "var(--ink-4)" }}>
          {action.owner_email || "unassigned"} · {new Date(action.created_at).toLocaleDateString()}
          {action.completed_at &&
            ` · completed ${new Date(action.completed_at).toLocaleDateString()}`}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {isCompleted ? (
          <button
            onClick={onReopen}
            className="text-xs px-2.5 py-1 rounded border transition"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            Reopen
          </button>
        ) : (
          <button
            onClick={onComplete}
            className="text-xs px-2.5 py-1 rounded text-white font-semibold transition"
            style={{ backgroundColor: "var(--pulse)" }}
          >
            Mark complete
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300 transition"
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{ borderColor: "var(--line)", backgroundColor: "white" }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase"
      style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
    >
      {children}
    </p>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full font-medium transition"
      style={{
        backgroundColor: active ? "var(--ink)" : "transparent",
        color: active ? "white" : "var(--ink-3)",
        border: active ? "1px solid var(--ink)" : "1px solid var(--line-2)",
      }}
    >
      {children}
    </button>
  );
}
