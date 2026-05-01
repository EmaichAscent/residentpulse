import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import ActionDrawer from "./ActionDrawer";
import ConfirmModal from "./ConfirmModal";
import OwnerPicker from "./OwnerPicker";

/**
 * Actions — strategic centerpiece of the round-over-round loop.
 *
 * Single concept, two states: each action you commit to is the
 * downstream of an AI recommendation (or a critical alert). They
 * share the same card slot — the card flips between two states
 * depending on whether the user has logged something against it.
 *
 *   STATE A · Recommended (no logged action yet)
 *      Recommendation body is the focal content. Accept / Modify /
 *      Decline CTAs. The pick stays in this slot until accepted.
 *
 *   STATE B · In flight (action logged against the theme)
 *      Active progress is the focal content — owner chip, latest
 *      update, mark-complete CTA. The original recommendation
 *      collapses into a click-to-expand provenance footer.
 *
 * Page composition reflects priorities:
 *   • Active picks rise to the top, loud
 *   • "Other actions in flight" — actions whose theme isn't on the
 *     current brief (warning-spawned via the Round Results alerts
 *     panel, or manually created) — render in the same State B
 *     shape just below
 *   • Recommended (still-to-decide) picks below that, only loud
 *     when there are NO active actions
 *   • Done — collapsed one-line summary rows at the bottom
 *
 * Owner assignment uses OwnerPicker → /api/admin/users (the same
 * Admin users list shown on Account → Admin users).
 */
export default function Actions() {
  const { user } = useOutletContext();
  const [actions, setActions] = useState([]);
  const [brief, setBrief] = useState({ round: null, picks: [], total_respondents: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerSeed, setDrawerSeed] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reopenError, setReopenError] = useState(null);

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
      setReopenError(err.message);
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
      setReopenError(err.message);
      setDeleteTarget(null);
    }
  };

  // Same backend as Round Results / Rounds landing — kept identical
  // so the three pages stay in sync.
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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

  // Bucket the data into the four sections.
  const actionByTheme = new Map();
  for (const a of actions) {
    if (!actionByTheme.has(a.theme)) actionByTheme.set(a.theme, a);
  }
  const matchedThemes = new Set();

  const activePicks = [];
  const pendingPicks = [];
  const declinedPicks = [];
  for (const pick of brief.picks) {
    const matched = actionByTheme.get(pick.theme);
    if (matched) {
      matchedThemes.add(pick.theme);
      if (matched.status !== "completed") {
        activePicks.push({ pick, action: matched });
      }
    } else if (pick.decision === "rejected") {
      declinedPicks.push(pick);
    } else {
      pendingPicks.push(pick);
    }
  }

  const otherInFlight = actions.filter(
    (a) => a.status !== "completed" && !matchedThemes.has(a.theme)
  );
  const doneActions = actions.filter((a) => a.status === "completed");

  const inFlightCount = activePicks.length + otherInFlight.length;

  return (
    <div className="flex flex-col" style={{ gap: 28 }} data-testid="actions">
      <Header
        round={brief.round}
        inFlightCount={inFlightCount}
        pendingCount={pendingPicks.length}
      />

      {/* ─── Active picks (State B) ─── */}
      {activePicks.map(({ pick, action }) => (
        <PickCard
          key={pick.theme}
          pick={pick}
          action={action}
          totalRespondents={brief.total_respondents}
          onMarkComplete={() => setCompleteTarget(action)}
          onAddUpdate={() =>
            setDrawerSeed({
              mode: "edit",
              actionId: action.id,
              theme: pick.theme,
              title: action.title,
              details: action.details || "",
              owner_email: action.owner_email || "",
              providence: pick,
            })
          }
          onReassign={(email) => updateAction(action.id, { owner_email: email })}
          onDelete={() => setDeleteTarget(action)}
        />
      ))}

      {/* ─── Other in-flight actions (warning-spawned or manual) ─── */}
      {otherInFlight.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          onMarkComplete={() => setCompleteTarget(action)}
          onAddUpdate={() =>
            setDrawerSeed({
              mode: "edit",
              actionId: action.id,
              theme: action.theme,
              title: action.title,
              details: action.details || "",
              owner_email: action.owner_email || "",
            })
          }
          onReassign={(email) => updateAction(action.id, { owner_email: email })}
          onDelete={() => setDeleteTarget(action)}
        />
      ))}

      {/* ─── Pending recommendations (State A) ─── */}
      {pendingPicks.length > 0 && (
        <PendingPicksHeader inFlightCount={inFlightCount} pendingCount={pendingPicks.length} />
      )}
      {pendingPicks.map((pick) => (
        <PickCard
          key={pick.theme}
          pick={pick}
          action={null}
          totalRespondents={brief.total_respondents}
          onAccept={() => handleDecision(pick.theme, "accepted")}
          onAcceptAndAssign={() =>
            setDrawerSeed({
              mode: "create",
              theme: pick.theme,
              title: pick.theme,
              details:
                [pick.summary, pick.rationale].filter(Boolean).join(" · ") ||
                (brief.round ? `Round ${brief.round.round_number} · ` : "") +
                  "Generated from AI insights.",
              owner_email: user?.email || "",
              providence: pick,
            })
          }
          onDecline={() => handleDecision(pick.theme, "rejected")}
          onUndoDecision={() => handleUndoDecision(pick.theme)}
        />
      ))}

      {/* ─── Empty states ─── */}
      {brief.picks.length === 0 && otherInFlight.length === 0 && doneActions.length === 0 && (
        <EmptyState reason={brief.round ? "no-picks" : "no-round"} />
      )}

      {/* ─── Done — collapsed one-liners ─── */}
      {(doneActions.length > 0 || declinedPicks.length > 0) && (
        <DoneSection actions={doneActions} declined={declinedPicks} round={brief.round} />
      )}

      {/* ─── Drawer ─── */}
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
            ? `Mark "${completeTarget.title}" as completed?\n\nIt will move to the Done list. You can reopen it later.`
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
            ? `Delete "${deleteTarget.title}"?\n\nThis removes the entry permanently. The original recommendation stays available — you can re-accept it.`
            : ""
        }
        confirmLabel="Delete"
        destructive
      />

      {reopenError && (
        <div
          className="rounded-lg px-3 py-2 text-[12.5px]"
          style={{
            backgroundColor: "var(--coral-tint)",
            color: "var(--coral)",
            border: "1px solid var(--coral-soft)",
          }}
        >
          {reopenError}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Header — posture-aware copy
// ──────────────────────────────────────────────────────────────────────

function Header({ round, inFlightCount, pendingCount }) {
  let lede;
  if (inFlightCount > 0 && pendingCount > 0) {
    lede = (
      <>
        <strong style={{ color: "var(--pulse-deep)" }}>
          {inFlightCount} {inFlightCount === 1 ? "action" : "actions"} in flight
        </strong>
        . Here's where they stand. <strong>{pendingCount}</strong>{" "}
        {pendingCount === 1 ? "pick" : "picks"} still waiting on a decision.
      </>
    );
  } else if (inFlightCount > 0) {
    lede = (
      <>
        <strong style={{ color: "var(--pulse-deep)" }}>
          {inFlightCount} {inFlightCount === 1 ? "action" : "actions"} in flight
        </strong>
        . Here's where they stand.
      </>
    );
  } else if (pendingCount > 0) {
    lede = (
      <>
        <strong>
          {pendingCount} {pendingCount === 1 ? "pick" : "picks"} ready
        </strong>{" "}
        — choose what to commit to this quarter.
      </>
    );
  } else {
    lede = "All clear. Recommendations regenerate after each round closes.";
  }

  return (
    <div>
      {round && (
        <p
          className="text-[11px] font-semibold uppercase mb-1.5"
          style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
        >
          Round {round.round_number}
          {round.concluded_at &&
            ` · Closed ${new Date(round.concluded_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`}
        </p>
      )}
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
      <p className="text-[14px] mt-1.5" style={{ color: "var(--ink-3)" }}>
        {lede}
      </p>
    </div>
  );
}

function PendingPicksHeader({ inFlightCount, pendingCount }) {
  // When there are no active actions, the pending picks ARE the
  // focus — no eyebrow needed (header lede already says so). When
  // active actions exist, this thin eyebrow visually demotes pending
  // to "next up".
  if (inFlightCount === 0) return null;
  return (
    <div
      className="text-[11px] font-semibold uppercase"
      style={{ color: "var(--ink-4)", letterSpacing: "0.12em", marginTop: 4, marginBottom: -12 }}
    >
      Still to decide · {pendingCount}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PickCard — handles both states A and B
// ──────────────────────────────────────────────────────────────────────

function PickCard({
  pick,
  action,
  totalRespondents,
  onAccept,
  onAcceptAndAssign,
  onDecline,
  onUndoDecision,
  onMarkComplete,
  onAddUpdate,
  onReassign,
  onDelete,
}) {
  const isActive = !!action;
  const lift = computeLift(pick, totalRespondents);

  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: isActive ? "var(--shadow-md)" : "var(--shadow-sm)",
        borderLeft: isActive ? "3px solid var(--pulse)" : "1px solid var(--line)",
        padding: "22px 24px",
      }}
    >
      <CardHead
        rank={`PICK ${pick.rank}`}
        statusPill={
          isActive ? (
            <Pill tone="in-flight">
              <PulseDot /> In flight
            </Pill>
          ) : (
            <Pill tone="neutral">Recommended</Pill>
          )
        }
        priority={pick.priority}
        liftBadge={!isActive && lift != null && lift > 0 ? `↑ +${lift} NPS projected` : null}
      />

      {isActive ? (
        <>
          {/* In-flight: the *action title* (what the user committed
              to) is the headline. The pick theme drops to a small
              eyebrow above so the lineage stays visible — but the
              focal content is the work itself. */}
          <div
            className="text-[11.5px] font-semibold uppercase mt-2"
            style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
          >
            From pick · {pick.theme}
          </div>
          <Title>{action.title}</Title>
          <ActiveBody
            action={action}
            onMarkComplete={onMarkComplete}
            onAddUpdate={onAddUpdate}
            onReassign={onReassign}
            onDelete={onDelete}
            provenance={
              <Provenance label="Original recommendation" tone="pulse">
                <ProvenanceBlock
                  source={`From AI Pick · accepted ${formatDate(action.created_at)}`}
                  summary={pick.summary}
                  rationale={pick.rationale}
                />
              </Provenance>
            }
          />
        </>
      ) : (
        <>
          <Title>{pick.theme}</Title>
          <RecommendedBody
            pick={pick}
            totalRespondents={totalRespondents}
            lift={lift}
            onAccept={onAccept}
            onAcceptAndAssign={onAcceptAndAssign}
            onDecline={onDecline}
            onUndoDecision={onUndoDecision}
          />
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ActionCard — for actions whose theme isn't on the brief
// (warning-spawned via Round Results alerts panel, or manual). Same
// State B visual; provenance footer differs.
// ──────────────────────────────────────────────────────────────────────

function ActionCard({ action, onMarkComplete, onAddUpdate, onReassign, onDelete }) {
  const sourceLabel = labelForAlertTheme(action.theme) || action.theme || "Manual entry";
  const isAlert = isAlertTheme(action.theme);

  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-md)",
        borderLeft: "3px solid var(--pulse)",
        padding: "22px 24px",
      }}
    >
      <CardHead
        rank={isAlert ? "ALERT" : "ACTION"}
        statusPill={
          <Pill tone="in-flight">
            <PulseDot /> In flight
          </Pill>
        }
        sideBadge={isAlert ? <Pill tone="warn">{sourceLabel}</Pill> : null}
      />
      <Title>{action.title}</Title>

      <ActiveBody
        action={action}
        onMarkComplete={onMarkComplete}
        onAddUpdate={onAddUpdate}
        onReassign={onReassign}
        onDelete={onDelete}
        provenance={
          <Provenance
            label={isAlert ? "Alert that triggered this" : "Source"}
            tone={isAlert ? "coral" : "neutral"}
          >
            <ProvenanceBlock
              source={
                isAlert
                  ? `Critical alert · logged ${formatDate(action.created_at)}`
                  : `Manually created · ${formatDate(action.created_at)}`
              }
              summary={
                isAlert
                  ? `Triggered by a "${sourceLabel}" alert. Action created via the Round Results alerts panel.`
                  : "Created directly from the Actions screen."
              }
            />
          </Provenance>
        }
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// State B body — owner, latest update, CTAs, provenance footer
// ──────────────────────────────────────────────────────────────────────

function ActiveBody({ action, onMarkComplete, onAddUpdate, onReassign, onDelete, provenance }) {
  return (
    <>
      {/* Latest update — uses the action's `details` field as the
          single most-recent note. A future PR can layer a real updates
          table; for now, "Add update" overwrites the same field via
          the drawer in edit mode. */}
      {action.details && (
        <div
          className="rounded-xl"
          style={{
            backgroundColor: "var(--pulse-tint)",
            padding: "12px 16px",
            marginTop: 14,
            borderLeft: "2px solid var(--pulse-soft)",
          }}
        >
          <div
            className="text-[10.5px] font-semibold uppercase mb-1"
            style={{ letterSpacing: "0.1em", color: "var(--pulse-deep)" }}
          >
            Latest update
          </div>
          <p
            className="text-[13px]"
            style={{
              color: "var(--ink-2)",
              lineHeight: 1.5,
              fontStyle: "italic",
              margin: 0,
            }}
          >
            "{action.details}"
          </p>
          <div className="text-[11px] mt-2" style={{ color: "var(--ink-4)" }}>
            {action.owner_email ? `${action.owner_email} · ` : ""}
            logged {formatRelativeDate(action.created_at)}
          </div>
        </div>
      )}

      <div className="flex items-center" style={{ gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Owner
        </span>
        <OwnerPicker value={action.owner_email || ""} onChange={onReassign} compact />
      </div>

      <div className="flex items-center mt-4" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onMarkComplete}
          className="font-semibold rounded-lg transition"
          style={{
            backgroundColor: "var(--pulse)",
            color: "white",
            padding: "8px 14px",
            fontSize: 12.5,
            cursor: "pointer",
            border: "1px solid var(--pulse)",
          }}
        >
          Mark complete
        </button>
        <button
          type="button"
          onClick={onAddUpdate}
          className="font-semibold rounded-lg transition"
          style={{
            backgroundColor: "white",
            color: "var(--ink)",
            padding: "8px 14px",
            fontSize: 12.5,
            border: "1px solid var(--line-2)",
            cursor: "pointer",
          }}
        >
          {action.details ? "Edit update" : "Add update"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="font-semibold transition"
          style={{
            background: "transparent",
            color: "var(--ink-4)",
            padding: "8px 4px",
            fontSize: 12,
            border: 0,
            cursor: "pointer",
          }}
          title="Delete this action"
        >
          Delete
        </button>
      </div>

      {provenance}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// State A body — recommendation read + CTAs
// ──────────────────────────────────────────────────────────────────────

function RecommendedBody({
  pick,
  totalRespondents,
  lift,
  onAccept,
  onAcceptAndAssign,
  onDecline,
  onUndoDecision,
}) {
  const isAccepted = pick.decision === "accepted";

  return (
    <>
      {pick.summary && (
        <p
          className="text-[13.5px]"
          style={{
            color: "var(--ink-2)",
            lineHeight: 1.55,
            margin: "12px 0 0",
          }}
        >
          {pick.summary}
        </p>
      )}
      {pick.rationale && pick.rationale !== pick.summary && (
        <p
          className="text-[13px]"
          style={{
            color: "var(--ink-3)",
            lineHeight: 1.55,
            margin: "8px 0 0",
          }}
        >
          {pick.rationale}
        </p>
      )}

      {(lift != null && lift > 0) || pick.affected_detractor_count != null ? (
        <p className="text-[11.5px]" style={{ color: "var(--ink-4)", marginTop: 10 }}>
          {pick.affected_detractor_count != null && totalRespondents > 0
            ? `Affecting ${pick.affected_detractor_count} of ${totalRespondents} respondents`
            : null}
          {lift != null && lift > 0 ? (
            <>
              {" "}
              · projected lift <strong style={{ color: "var(--pulse-deep)" }}>+{lift} NPS</strong>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center mt-4" style={{ gap: 8, flexWrap: "wrap" }}>
        {isAccepted ? (
          <>
            <button
              type="button"
              onClick={onAcceptAndAssign}
              className="font-semibold rounded-lg transition"
              style={{
                backgroundColor: "var(--pulse)",
                color: "white",
                padding: "9px 16px",
                fontSize: 13,
                border: "1px solid var(--pulse)",
                cursor: "pointer",
              }}
            >
              Configure &amp; assign owner →
            </button>
            <button
              type="button"
              onClick={onUndoDecision}
              className="font-semibold transition"
              style={{
                background: "transparent",
                color: "var(--ink-4)",
                padding: "9px 4px",
                fontSize: 12,
                border: 0,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Change my mind
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onAcceptAndAssign}
              className="font-semibold rounded-lg transition"
              style={{
                backgroundColor: "var(--pulse)",
                color: "white",
                padding: "9px 16px",
                fontSize: 13,
                border: "1px solid var(--pulse)",
                cursor: "pointer",
              }}
            >
              Accept &amp; assign owner →
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="font-semibold rounded-lg transition"
              style={{
                backgroundColor: "white",
                color: "var(--ink)",
                padding: "9px 16px",
                fontSize: 13,
                border: "1px solid var(--line-2)",
                cursor: "pointer",
              }}
              title="Accept now, assign owner later"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="font-semibold transition"
              style={{
                background: "transparent",
                color: "var(--ink-4)",
                padding: "9px 4px",
                fontSize: 12,
                border: 0,
                cursor: "pointer",
              }}
            >
              Decline
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Card head + atoms
// ──────────────────────────────────────────────────────────────────────

function CardHead({ rank, statusPill, priority, liftBadge, sideBadge }) {
  const priorityLabel = priorityLabelFor(priority);
  return (
    <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
      <span
        className="font-semibold"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-4)",
          letterSpacing: "0.06em",
        }}
      >
        {rank}
      </span>
      {statusPill}
      {priorityLabel && <Pill tone={priorityLabel.tone}>{priorityLabel.label}</Pill>}
      {sideBadge}
      {liftBadge && (
        <span
          className="text-[11px] font-semibold rounded-full"
          style={{
            color: "var(--pulse-deep)",
            backgroundColor: "var(--pulse-tint)",
            padding: "3px 9px",
          }}
        >
          {liftBadge}
        </span>
      )}
    </div>
  );
}

function Title({ children }) {
  return (
    <h3
      className="font-medium"
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 20,
        letterSpacing: "-0.01em",
        color: "var(--ink)",
        marginTop: 8,
        marginBottom: 0,
        lineHeight: 1.25,
      }}
    >
      {children}
    </h3>
  );
}

function Pill({ tone, children }) {
  const tones = {
    "in-flight": { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    neutral: { bg: "var(--paper-2)", color: "var(--ink-2)" },
    high: { bg: "var(--coral-tint)", color: "var(--coral)" },
    medium: { bg: "var(--amber-tint)", color: "var(--amber)" },
    low: { bg: "var(--paper-2)", color: "var(--ink-3)" },
    "keep-doing": { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    warn: { bg: "var(--coral-tint)", color: "var(--coral)" },
    done: { bg: "var(--leaf-tint)", color: "var(--leaf)" },
    declined: { bg: "var(--paper-3)", color: "var(--ink-3)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{
        backgroundColor: t.bg,
        color: t.color,
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 9px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function PulseDot() {
  return (
    <>
      <span
        className="rounded-full inline-block"
        style={{
          width: 6,
          height: 6,
          backgroundColor: "var(--pulse)",
          animation: "actions-pulse 1.6s infinite",
        }}
      />
      <style>{`
        @keyframes actions-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Provenance footer — collapsible, shows source of truth
// ──────────────────────────────────────────────────────────────────────

function Provenance({ label, tone, children }) {
  const [open, setOpen] = useState(false);
  const accent =
    tone === "pulse" ? "var(--pulse-deep)" : tone === "coral" ? "var(--coral)" : "var(--ink-3)";
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid var(--line)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-semibold inline-flex items-center"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          color: open ? accent : "var(--ink-3)",
          fontSize: 12,
          cursor: "pointer",
          gap: 6,
        }}
      >
        <span style={{ color: "var(--ink-4)" }}>{open ? "▾" : "▸"}</span>
        {label}
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function ProvenanceBlock({ source, summary, rationale }) {
  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: "var(--paper-2)",
        padding: "14px 16px",
        fontSize: 12.5,
        lineHeight: 1.55,
        color: "var(--ink-2)",
      }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase mb-2"
        style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        {source}
      </div>
      {summary && <p style={{ margin: 0 }}>{summary}</p>}
      {rationale && rationale !== summary && (
        <p style={{ margin: "8px 0 0", color: "var(--ink-3)" }}>{rationale}</p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Done section — collapsed one-liners, expandable
// ──────────────────────────────────────────────────────────────────────

function DoneSection({ actions, declined, round }) {
  const items = [
    ...actions.map((a) => ({
      kind: "done",
      key: `a-${a.id}`,
      action: a,
      date: a.completed_at || a.created_at,
    })),
    ...declined.map((p) => ({
      kind: "declined",
      key: `p-${p.theme}`,
      pick: p,
      date: p.decided_at || (round && round.concluded_at) || null,
    })),
  ].sort((a, b) => {
    const ad = a.date ? new Date(a.date).getTime() : 0;
    const bd = b.date ? new Date(b.date).getTime() : 0;
    return bd - ad;
  });

  return (
    <section style={{ marginTop: 8 }}>
      <p
        className="text-[11px] font-semibold uppercase mb-2"
        style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
      >
        Done · {items.length}
      </p>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {items.map((item) =>
          item.kind === "done" ? (
            <DoneRow key={item.key} action={item.action} />
          ) : (
            <DeclinedRow key={item.key} pick={item.pick} />
          )
        )}
      </div>
    </section>
  );
}

function DoneRow({ action }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white" style={{ border: "1px solid var(--line)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full grid items-center gap-3 text-left"
        style={{
          padding: "11px 14px",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          gridTemplateColumns: "auto 1fr auto auto",
        }}
      >
        <span style={{ color: "var(--pulse)", fontWeight: 700, fontSize: 14 }}>✓</span>
        <span className="font-semibold truncate" style={{ color: "var(--ink-2)", fontSize: 13 }}>
          {action.title}
        </span>
        <Pill tone="done">Done</Pill>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--ink-4)",
          }}
        >
          {formatDate(action.completed_at || action.created_at)}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "10px 14px 14px",
            borderTop: "1px solid var(--line)",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--ink-3)",
          }}
        >
          <div
            className="text-[10.5px] font-semibold uppercase mb-1.5"
            style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
          >
            Theme
          </div>
          <p className="mb-3" style={{ margin: 0, color: "var(--ink-2)" }}>
            {action.theme}
          </p>
          {action.details && (
            <>
              <div
                className="text-[10.5px] font-semibold uppercase mb-1.5 mt-3"
                style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
              >
                Final note
              </div>
              <p style={{ margin: 0, color: "var(--ink-2)", fontStyle: "italic" }}>
                "{action.details}"
              </p>
            </>
          )}
          <div className="text-[11px] mt-3" style={{ color: "var(--ink-4)" }}>
            {action.owner_email && `${action.owner_email} · `}logged {formatDate(action.created_at)}
            {action.completed_at && ` · completed ${formatDate(action.completed_at)}`}
          </div>
        </div>
      )}
    </div>
  );
}

function DeclinedRow({ pick }) {
  return (
    <div
      className="rounded-xl bg-white grid items-center"
      style={{
        border: "1px solid var(--line)",
        padding: "11px 14px",
        gridTemplateColumns: "auto 1fr auto auto",
        gap: 12,
      }}
    >
      <span style={{ color: "var(--ink-4)", fontSize: 14 }}>✕</span>
      <span
        className="truncate"
        style={{
          color: "var(--ink-3)",
          fontSize: 13,
          textDecoration: "line-through",
        }}
      >
        {pick.theme}
      </span>
      <Pill tone="declined">Declined</Pill>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--ink-4)",
        }}
      >
        {pick.decided_at ? formatDate(pick.decided_at) : "—"}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Empty state
// ──────────────────────────────────────────────────────────────────────

function EmptyState({ reason }) {
  return (
    <div
      className="rounded-2xl"
      style={{
        border: "1px solid var(--line)",
        backgroundColor: "white",
        padding: 32,
        textAlign: "center",
      }}
    >
      <h3
        className="font-medium"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color: "var(--ink)",
          letterSpacing: "-0.015em",
          marginBottom: 6,
        }}
      >
        {reason === "no-round" ? "No brief yet" : "All clear"}
      </h3>
      <p
        className="text-[13px] max-w-md mx-auto"
        style={{ color: "var(--ink-3)", margin: "0 auto" }}
      >
        {reason === "no-round"
          ? "The brief generates from the AI insights of the most recent concluded round. Conclude a round to see picks here."
          : "No picks waiting on a decision and nothing in flight. Recommendations regenerate after each round closes."}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

// Same projection as Round Results' "What detractors hate" lift —
// half of the affected detractors are assumed to convert to passive
// when the issue is addressed, expressed as an NPS-point delta over
// the entire respondent base.
function computeLift(pick, totalRespondents) {
  if (typeof pick.affected_detractor_count !== "number" || !totalRespondents) {
    return null;
  }
  return Math.round((0.5 * pick.affected_detractor_count * 100) / totalRespondents);
}

function priorityLabelFor(priority) {
  switch (priority) {
    case "high":
      return { label: "High priority", tone: "high" };
    case "medium":
      return { label: "Medium priority", tone: "medium" };
    case "low":
      return { label: "Low", tone: "low" };
    case "keep_doing":
      return { label: "Keep doing", tone: "keep-doing" };
    default:
      return null;
  }
}

// alert_type values that come out of /chat → critical_alerts.
const ALERT_THEMES = {
  contract_termination: "Contract termination",
  legal_threat: "Legal threat",
  safety_concern: "Safety concern",
  other_critical: "Critical concern",
};

function isAlertTheme(theme) {
  return Object.prototype.hasOwnProperty.call(ALERT_THEMES, theme);
}

function labelForAlertTheme(theme) {
  return ALERT_THEMES[theme] || null;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(iso) {
  if (!iso) return "just now";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(iso);
}
