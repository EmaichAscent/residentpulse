import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Rounds page — full rebuild to match the build spec Mike shared:
 *
 *   1. Page header: title + cadence toggle + Export + Schedule round
 *   2. Stat strip: rounds completed / avg response rate / latest NPS+delta / avg NPS
 *   3. Next round hero (dark card) with pre-flight checklist + Launch / Configure
 *   4. Completed rounds list (most recent first) — clickable rows
 *   5. Future planned rounds list (compact)
 *   6. Schedule round modal (centered, click-outside closes)
 *
 * Empty states per spec:
 *   • No completed rounds: stat strip + completed list hidden, single
 *     "Your first round hasn't run yet" card shown under the hero.
 *   • No next round: hero hidden, inline "Schedule your next round"
 *     CTA in the same slot.
 *   • Live (in-progress) round: surfaces above completed list with a
 *     real-time response counter and Close-early action.
 *
 * Source-of-truth APIs:
 *   GET    /api/admin/survey-rounds          — list (concluded + planned + live)
 *   GET    /api/admin/account                — cadence + member counts
 *   PATCH  /api/admin/account/cadence        — update cadence
 *   GET    /api/admin/survey-rounds/:id/preflight — hero pre-flight data
 *   POST   /api/admin/survey-rounds/:id/launch    — launch now
 *   POST   /api/admin/survey-rounds/custom        — schedule a custom round
 *   PATCH  /api/admin/survey-rounds/:id/reschedule — change a planned date
 *   POST   /api/admin/survey-rounds/:id/close      — close in-progress early
 */
export default function RoundsLanding() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [account, setAccount] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cadenceUpdating, setCadenceUpdating] = useState(false);
  const [launching, setLaunching] = useState(null);
  const [closing, setClosing] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // When configuring an existing planned round (vs scheduling a new one),
  // we open the same modal pre-filled. The modal sends a PATCH to
  // /reschedule for the date when configuring; POST /custom when new.
  const [configuringRound, setConfiguringRound] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  // Latest concluded round's recommended_actions_status. Lets the
  // operator triage decisions (accept/reject) without drilling into
  // /admin/rounds/:id. Hydrated from a second fetch when there's at
  // least one concluded round.
  const [latestRoundData, setLatestRoundData] = useState(null);
  // AI brief status — drives the optional "Re-brief the AI" button on
  // the next-round hero so admins can refresh the interview supplement
  // before launching a new round. lastInterviewDate is rendered as
  // relative age ("3 mo ago") so admins know when their context is stale.
  const [interviewStatus, setInterviewStatus] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [rRes, aRes, iRes] = await Promise.all([
        fetch("/api/admin/survey-rounds", { credentials: "include" }),
        fetch("/api/admin/account", { credentials: "include" }),
        fetch("/api/admin/interview/status", { credentials: "include" }),
      ]);
      if (rRes.ok) setRounds(await rRes.json());
      if (aRes.ok) setAccount(await aRes.json());
      if (iRes.ok) setInterviewStatus(await iRes.json());
    } catch (err) {
      console.error("Failed to load rounds:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Whenever the rounds list changes, refetch pre-flight data for the
  // upcoming round (the lowest-id planned). Skip if no planned round.
  const next = rounds.filter((r) => r.status === "planned").sort((a, b) => a.id - b.id)[0];
  const live = rounds.find((r) => r.status === "in_progress");
  const concluded = rounds
    .filter((r) => r.status === "concluded")
    .sort((a, b) => b.round_number - a.round_number);
  const futurePlanned = rounds
    .filter((r) => r.status === "planned" && r.id !== next?.id)
    .sort((a, b) => a.round_number - b.round_number);

  useEffect(() => {
    if (!next) {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/survey-rounds/${next.id}/preflight`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setPreflight(data);
      })
      .catch(() => {
        if (!cancelled) setPreflight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [next?.id]);

  // Load the latest concluded round's dashboard so we can surface
  // pending recommendations (accept/reject) right on the landing page.
  // Skipped when there are no concluded rounds.
  const latestConcluded = rounds
    .filter((r) => r.status === "concluded")
    .sort((a, b) => b.round_number - a.round_number)[0];

  useEffect(() => {
    if (!latestConcluded) {
      setLatestRoundData(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/survey-rounds/${latestConcluded.id}/dashboard`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!cancelled) setLatestRoundData(d);
      })
      .catch(() => {
        if (!cancelled) setLatestRoundData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestConcluded?.id]);

  // Decision handlers — same shape as RoundDashboard's. We optimistically
  // update local state so the UI flips immediately.
  const handleDecisionForLatest = async (theme, decision) => {
    if (!theme || !latestConcluded) return;
    try {
      const res = await fetch("/api/admin/actions/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ round_id: latestConcluded.id, theme, decision }),
      });
      if (res.ok) {
        setLatestRoundData((prev) =>
          prev
            ? {
                ...prev,
                recommended_actions_status: (prev.recommended_actions_status || []).map((p) =>
                  p.action === theme ? { ...p, decision, decided_at: new Date().toISOString() } : p
                ),
              }
            : prev
        );
      }
    } catch (err) {
      console.error("Failed to record decision:", err);
    }
  };

  const handleUndoDecisionForLatest = async (theme) => {
    if (!theme || !latestConcluded) return;
    try {
      const res = await fetch("/api/admin/actions/decisions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ round_id: latestConcluded.id, theme }),
      });
      if (res.ok) {
        setLatestRoundData((prev) =>
          prev
            ? {
                ...prev,
                recommended_actions_status: (prev.recommended_actions_status || []).map((p) =>
                  p.action === theme ? { ...p, decision: null, decided_at: null } : p
                ),
              }
            : prev
        );
      }
    } catch (err) {
      console.error("Failed to undo decision:", err);
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────────────

  const handleCadenceChange = async (newCadence) => {
    if (cadenceUpdating || newCadence === account?.survey_cadence) return;
    setCadenceUpdating(true);
    try {
      const res = await fetch("/api/admin/account/cadence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ survey_cadence: newCadence }),
      });
      if (res.ok) {
        await loadData();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to update cadence");
      }
    } finally {
      setCadenceUpdating(false);
    }
  };

  const handleLaunch = async (roundId) => {
    setLaunching(roundId);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/launch`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        await loadData();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to launch round");
      }
    } finally {
      setLaunching(null);
    }
  };

  const handleCloseEarly = async (roundId) => {
    setClosing(roundId);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setConfirmClose(null);
        await loadData();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to close round");
      }
    } finally {
      setClosing(null);
    }
  };

  // Reschedule accepts an optional window_days override. The inline
  // "Reschedule" buttons on the planned-rounds list pass date only;
  // the configure modal can pass both date + window_days.
  const handleReschedule = async (roundId, newDate, windowDays) => {
    if (!newDate) return;
    try {
      const body = { scheduled_date: newDate };
      if (windowDays != null) body.window_days = windowDays;
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setReschedulingId(null);
        setRescheduleDate("");
        await loadData();
      } else {
        const errBody = await res.json().catch(() => ({}));
        alert(errBody.error || "Failed to reschedule");
      }
    } catch (err) {
      console.error("Reschedule failed:", err);
    }
  };

  const handleScheduleSubmit = async (data) => {
    try {
      const res = await fetch("/api/admin/survey-rounds/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scheduled_date: data.scheduled_date,
          window_days: data.window_days,
        }),
      });
      if (res.ok) {
        setScheduleOpen(false);
        await loadData();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to schedule round");
      }
    } catch (err) {
      console.error("Schedule failed:", err);
      alert("Failed to schedule round");
    }
  };

  const handleExportCsv = () => {
    const header = [
      "id",
      "label",
      "start",
      "end",
      "responses",
      "total",
      "pct",
      "nps",
      "warnings",
      "status",
    ];
    const lines = [header.join(",")];
    for (const r of rounds) {
      const row = roundShape(r);
      const fields = [
        r.id,
        row.label,
        row.start || "",
        row.end || "",
        row.responses ?? "",
        row.total ?? "",
        row.pct ?? "",
        row.nps ?? "",
        row.warnings ?? "",
        r.status,
      ];
      lines.push(fields.map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rounds-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ────────────────────────────────────────────────────────────────────
  // Computed: stat strip
  // ────────────────────────────────────────────────────────────────────

  const concludedCount = concluded.length;
  // Postgres returns COUNT(*) and other numeric aggregates as STRINGS.
  // Without the explicit Number() cast `s + r.responses_completed`
  // string-concatenates ("0" + "45" + "64" + …), producing the
  // "27663179%" garbage rate Mike spotted.
  const totalResponses = concluded.reduce((s, r) => s + Number(r.responses_completed || 0), 0);
  const totalInvited = concluded.reduce(
    (s, r) => s + Number(r.members_invited || r.invitations_sent || 0),
    0
  );
  const avgResponsePct = totalInvited > 0 ? Math.round((totalResponses / totalInvited) * 100) : 0;
  const concludedNpsValues = concluded.map((r) => extractNps(r)).filter((n) => n != null);
  const latestNps = concludedNpsValues[0] != null ? concludedNpsValues[0] : null;
  const baselineNps = concludedNpsValues[concludedNpsValues.length - 1] ?? null;
  const npsDelta = latestNps != null && baselineNps != null ? latestNps - baselineNps : null;
  const avgNps =
    concludedNpsValues.length > 0
      ? Math.round(concludedNpsValues.reduce((a, b) => a + b, 0) / concludedNpsValues.length)
      : null;

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading rounds…</p>;
  }

  return (
    <div className="space-y-3.5" data-testid="rounds-landing">
      {/* 1. PAGE HEADER */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            Rounds
          </h1>
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
            History of survey rounds, what's coming next, and one-click scheduling.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CadenceToggle
            value={account?.survey_cadence || 2}
            maxAllowed={account?.max_survey_cadence || 2}
            onChange={handleCadenceChange}
            disabled={cadenceUpdating}
          />
          <button onClick={handleExportCsv} className="btn-ghost" type="button">
            Export
          </button>
          <button onClick={() => setScheduleOpen(true)} className="btn-pulse" type="button">
            Schedule round
          </button>
        </div>
      </div>

      {/* 2. STAT STRIP — only when there's data */}
      {concludedCount > 0 && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <StatCell label="Rounds completed" value={concludedCount} valueColor="var(--ink)" />
          <StatCell
            label="Avg response rate"
            value={`${avgResponsePct}%`}
            valueColor="var(--ink)"
            sub={`${totalResponses} of ${totalInvited}`}
          />
          <StatCell
            label="Latest NPS"
            value={latestNps != null ? formatNps(latestNps) : "—"}
            valueColor={npsColor(latestNps)}
            delta={npsDelta}
          />
          <StatCell
            label="Avg NPS"
            value={avgNps != null ? formatNps(avgNps) : "—"}
            valueColor={npsColor(avgNps)}
          />
        </div>
      )}

      {/* 3. NEXT ROUND HERO (dark card) */}
      {next ? (
        <NextRoundHero
          next={next}
          preflight={preflight}
          launching={launching === next.id}
          onLaunch={() => handleLaunch(next.id)}
          onConfigure={() => setConfiguringRound(next)}
          interviewStatus={interviewStatus}
          onReBrief={() => navigate(`/admin/onboarding?type=re_interview&launch_round=${next.id}`)}
        />
      ) : (
        <ScheduleNextCta onSchedule={() => setScheduleOpen(true)} />
      )}

      {/* Live (in-progress) round */}
      {live && (
        <LiveRoundCard
          round={live}
          onClose={() => setConfirmClose(live)}
          closing={closing === live.id}
          onView={() => navigate(`/admin/rounds/${live.id}`)}
        />
      )}

      {/* 3c. PENDING RECOMMENDATIONS — Latest concluded round's
            AI-generated recommendations awaiting an accept/reject
            decision. Surfaced on the landing page so operators don't
            have to drill into Round Results to triage. NPS-lift
            projections shown per pick. */}
      {latestRoundData?.recommended_actions_status?.some((p) => !p.decision) && (
        <div>
          <SectionHeader>
            <h3
              className="font-semibold text-[15px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              From Round {latestRoundData.round?.round_number} · decisions pending
            </h3>
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase"
                style={{
                  backgroundColor: "var(--coral-tint)",
                  color: "var(--coral)",
                  letterSpacing: "0.06em",
                }}
              >
                {latestRoundData.recommended_actions_status.filter((p) => !p.decision).length}{" "}
                awaiting decision
              </span>
              <button
                onClick={() => navigate(`/admin/rounds/${latestRoundData.round.id}`)}
                className="btn-ghost-sm"
                type="button"
              >
                Open round →
              </button>
            </div>
          </SectionHeader>
          <div
            className="rounded-2xl bg-white overflow-hidden"
            style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
          >
            {latestRoundData.recommended_actions_status
              .filter((p) => !p.decision && p.logged_action_id == null)
              .map((pick, i, arr) => (
                <PendingPickRow
                  key={i}
                  pick={pick}
                  totalRespondents={
                    latestRoundData.response_rate?.completed ||
                    latestRoundData.recommended_actions_status.length
                  }
                  isLast={i === arr.length - 1}
                  onAccept={() => handleDecisionForLatest(pick.action, "accepted")}
                  onReject={() => handleDecisionForLatest(pick.action, "rejected")}
                  onOpenRound={() => navigate(`/admin/rounds/${latestRoundData.round.id}`)}
                />
              ))}
          </div>
          {/* Surface rejected/accepted picks for awareness with an undo
              affordance. Keeps the pile from re-appearing on next load. */}
          {latestRoundData.recommended_actions_status.some((p) => p.decision) && (
            <div
              className="mt-2 text-[11.5px] flex items-center gap-2 flex-wrap"
              style={{ color: "var(--ink-4)" }}
            >
              {latestRoundData.recommended_actions_status
                .filter((p) => p.decision)
                .map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span
                      style={{
                        color: p.decision === "accepted" ? "var(--pulse-deep)" : "var(--ink-4)",
                      }}
                    >
                      {p.decision === "accepted" ? "✓" : "✕"} {truncate(p.action, 40)}
                    </span>
                    <button
                      onClick={() => handleUndoDecisionForLatest(p.action)}
                      className="underline"
                      style={{ color: "var(--ink-4)" }}
                      type="button"
                    >
                      undo
                    </button>
                    {i <
                      latestRoundData.recommended_actions_status.filter((x) => x.decision).length -
                        1 && " · "}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 4. COMPLETED ROUNDS LIST */}
      {concludedCount > 0 ? (
        <div>
          <SectionHeader>
            <h3
              className="font-semibold text-[15px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              Completed rounds
            </h3>
            <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
              {concludedCount} concluded
            </span>
          </SectionHeader>
          <div
            className="rounded-2xl bg-white overflow-hidden"
            style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
          >
            {concluded.map((r, i) => (
              <CompletedRoundRow
                key={r.id}
                round={r}
                isLast={i === concluded.length - 1}
                onClick={() => navigate(`/admin/rounds/${r.id}`)}
              />
            ))}
          </div>
        </div>
      ) : (
        !live && (
          <div
            className="rounded-2xl bg-white p-8 text-center"
            style={{ border: "1px solid var(--line)" }}
          >
            <div className="font-semibold text-[15px] mb-1" style={{ color: "var(--ink)" }}>
              Your first round hasn't run yet
            </div>
            <div className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              Once you launch the upcoming round and it concludes, you'll see results, NPS, response
              rates, and AI insights here.
            </div>
          </div>
        )
      )}

      {/* 5. FUTURE PLANNED ROUNDS */}
      {futurePlanned.length > 0 && (
        <div>
          <SectionHeader>
            <h3
              className="font-semibold text-[15px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              Future planned rounds
            </h3>
            <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
              {futurePlanned.length} planned
            </span>
          </SectionHeader>
          <div
            className="rounded-2xl bg-white overflow-hidden"
            style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
          >
            {futurePlanned.map((r, i) => (
              <PlannedRoundRow
                key={r.id}
                round={r}
                isLast={i === futurePlanned.length - 1}
                isRescheduling={reschedulingId === r.id}
                rescheduleDate={rescheduleDate}
                setRescheduleDate={setRescheduleDate}
                onStartReschedule={() => {
                  setReschedulingId(r.id);
                  setRescheduleDate(r.scheduled_date?.slice(0, 10) || "");
                }}
                onSubmitReschedule={() => handleReschedule(r.id, rescheduleDate)}
                onCancelReschedule={() => {
                  setReschedulingId(null);
                  setRescheduleDate("");
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 6. SCHEDULE ROUND MODAL — also reused for "Configure" on the
            next-round hero, in which case we pre-fill from the existing
            round and PATCH /reschedule on save instead of POST /custom. */}
      {scheduleOpen && (
        <ScheduleRoundModal
          mode="create"
          nextRoundNumber={maxRoundNumber(rounds) + 1}
          defaultDate={defaultNextDate(rounds, account?.survey_cadence || 2)}
          defaultWindowDays={21}
          audience={preflight?.audience}
          onCancel={() => setScheduleOpen(false)}
          onSubmit={handleScheduleSubmit}
        />
      )}
      {configuringRound && (
        <ScheduleRoundModal
          mode="configure"
          nextRoundNumber={configuringRound.round_number}
          defaultDate={configuringRound.scheduled_date?.slice(0, 10) || ""}
          defaultWindowDays={configuringRound.window_days ?? 21}
          audience={preflight?.audience}
          onCancel={() => setConfiguringRound(null)}
          onSubmit={async (data) => {
            await handleReschedule(configuringRound.id, data.scheduled_date, data.window_days);
            setConfiguringRound(null);
          }}
        />
      )}

      {/* Confirm-close-early modal */}
      {confirmClose && (
        <ConfirmCloseModal
          round={confirmClose}
          closing={closing === confirmClose.id}
          onCancel={() => setConfirmClose(null)}
          onConfirm={() => handleCloseEarly(confirmClose.id)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function CadenceToggle({ value, maxAllowed, onChange, disabled }) {
  const options = [
    { v: 2, label: "2×/yr" },
    { v: 4, label: "4×/yr" },
  ];
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ backgroundColor: "var(--paper-2)", border: "1px solid var(--line)" }}
    >
      {options.map((o) => {
        const isActive = value === o.v;
        const isDisabled = disabled || o.v > maxAllowed;
        return (
          <button
            key={o.v}
            onClick={() => !isActive && !isDisabled && onChange(o.v)}
            disabled={isDisabled}
            type="button"
            className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isActive ? "white" : "transparent",
              color: isActive ? "var(--ink)" : "var(--ink-3)",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
            }}
            title={
              o.v > maxAllowed
                ? `${o.label} requires plan upgrade`
                : `Set portfolio cadence to ${o.label}`
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCell({ label, value, valueColor, sub, delta }) {
  return (
    <div
      className="rounded-2xl bg-white px-5 py-4"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
    >
      <div
        className="text-[11px] font-semibold uppercase mb-1"
        style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: valueColor || "var(--ink)",
          }}
        >
          {value}
        </span>
        {delta != null && (
          <span
            className="text-[12px] font-semibold rounded-full"
            style={{
              backgroundColor: delta > 0 ? "var(--pulse-tint)" : "var(--coral-tint)",
              color: delta > 0 ? "var(--pulse-deep)" : "var(--coral)",
              padding: "2px 7px",
            }}
          >
            {delta > 0 ? "↑ +" : "↓ "}
            {delta}
          </span>
        )}
      </div>
      {sub && (
        <div className="text-[11.5px] mt-1" style={{ color: "var(--ink-4)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function NextRoundHero({
  next,
  preflight,
  launching,
  onLaunch,
  onConfigure,
  interviewStatus,
  onReBrief,
}) {
  const sd = next.scheduled_date ? new Date(next.scheduled_date) : null;
  const audience = preflight?.audience || {};
  const checks = preflightChecks(preflight);
  const hasError = checks.some((c) => c.state === "error");

  // AI brief age — surfaced above the Re-brief button so admins know
  // when their interview supplement was last refreshed. Only show the
  // button if there's at least one completed interview on file (i.e.
  // the admin actually has a brief to refresh).
  const briefAgeLabel = (() => {
    if (!interviewStatus?.lastInterviewDate) return null;
    const days = Math.floor(
      (Date.now() - new Date(interviewStatus.lastInterviewDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days < 1) return "Brief updated today";
    if (days < 30) return `Brief: ${days}d old`;
    const months = Math.round(days / 30);
    return `Brief: ${months}mo old`;
  })();
  const showReBrief = !!interviewStatus?.hasCompletedInterview;
  const briefIsStale = (() => {
    if (!interviewStatus?.lastInterviewDate) return false;
    const days = Math.floor(
      (Date.now() - new Date(interviewStatus.lastInterviewDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days >= 90;
  })();

  return (
    <div
      className="rounded-2xl overflow-hidden text-white"
      style={{
        background: "linear-gradient(135deg, var(--ink), var(--ink-2))",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <div
            className="text-[11px] font-semibold uppercase mb-1"
            style={{ letterSpacing: "0.12em", color: "var(--ink-5)" }}
          >
            Next round
          </div>
          <div
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              letterSpacing: "-0.02em",
            }}
          >
            Round {next.round_number}
          </div>
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-5)" }}>
            Scheduled for{" "}
            <span className="font-mono">
              {sd
                ? sd.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"}
            </span>
            {" · "}
            {audience.invitees ?? "—"} invitees across {audience.communities ?? "—"} communities
            {/* Window + resident follow-up cadence. surveyRounds.js
                → POST /:id/launch sets closes_at to +window_days from
                launch; scheduler.js sends resident follow-ups at
                floor(window/3) and floor(2*window/3) elapsed days.
                Default window is 21 → reminders at days 7 + 14
                elapsed (Day 8 + Day 15 calendar). The pre-launch
                ADMIN reminders shown in the pre-flight strip below
                are a separate schedule (14/7/1 days before launch). */}
            {(() => {
              const w = next.window_days || 21;
              const c = followUpCadence(w);
              return ` · ${w}-day response window · resident follow-ups at days ${c.first + 1} & ${c.second + 1}`;
            })()}
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end flex-shrink-0">
          <button
            onClick={onLaunch}
            disabled={launching || hasError}
            className="px-4 py-2 text-[13px] font-semibold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--pulse)", color: "white" }}
          >
            {launching ? "Launching…" : "Launch now"}
          </button>
          <button
            onClick={onConfigure}
            type="button"
            className="px-4 py-2 text-[13px] font-semibold rounded-lg transition"
            style={{
              backgroundColor: "transparent",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.25)",
            }}
          >
            Configure
          </button>
          {showReBrief && (
            <div className="flex flex-col items-end gap-0.5 mt-1">
              <button
                onClick={onReBrief}
                type="button"
                className="px-4 py-2 text-[13px] font-semibold rounded-lg transition flex items-center gap-1.5"
                style={{
                  backgroundColor: briefIsStale
                    ? "var(--amber-tint, rgba(248,168,84,0.18))"
                    : "transparent",
                  color: briefIsStale ? "var(--amber)" : "white",
                  border: briefIsStale
                    ? "1px solid var(--amber-soft, rgba(248,168,84,0.5))"
                    : "1px solid rgba(255, 255, 255, 0.25)",
                }}
                title="Optional. Re-interview the AI to refresh the per-client brief that personalizes board interviews."
              >
                <RefreshIcon />
                Re-brief the AI
              </button>
              {briefAgeLabel && (
                <span
                  className="text-[10.5px] font-mono"
                  style={{ color: briefIsStale ? "var(--amber)" : "var(--ink-5)" }}
                >
                  {briefAgeLabel}
                  {briefIsStale && " · consider refreshing"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="px-6 py-3 grid gap-3"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          background: "rgba(255, 255, 255, 0.04)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {checks.map((c, i) => (
          <PreflightCheck key={i} check={c} />
        ))}
      </div>
    </div>
  );
}

function preflightChecks(preflight) {
  if (!preflight) {
    return [
      { label: "Member roster synced", state: "pending", detail: "Loading…" },
      { label: "Survey prompt", state: "pending", detail: "Loading…" },
      { label: "Reminder schedule", state: "pending", detail: "Loading…" },
      { label: "Communities with contacts", state: "pending", detail: "Loading…" },
    ];
  }
  return [
    {
      label: "Member roster synced",
      state: preflight.roster_synced_at ? "ok" : "warn",
      detail: preflight.roster_synced_at
        ? `Last update ${formatRelative(preflight.roster_synced_at)}`
        : "No members yet",
    },
    {
      label: "Survey prompt",
      state: preflight.prompt_approved ? "ok" : "warn",
      detail: `${preflight.prompt_version || "default"} ${preflight.prompt_approved ? "approved" : "default"}`,
    },
    {
      // Admin alerts before the round LAUNCHES (so the operator
      // remembers to review). Resident follow-ups DURING the round
      // are days 10 + 20 of the open window — separate cadence,
      // surfaced in the hero subtitle above.
      label: "Admin alerts set",
      state: preflight.reminders_set ? "ok" : "warn",
      detail: preflight.reminders_set ? "14 / 7 / 1 days before launch" : "Not configured",
    },
    {
      label: "Communities with contacts",
      state: preflight.communities_missing_contacts === 0 ? "ok" : "warn",
      detail:
        preflight.communities_missing_contacts === 0
          ? "All communities ready"
          : `${preflight.communities_missing_contacts} missing manager`,
    },
  ];
}

function PreflightCheck({ check }) {
  const dotColor =
    check.state === "ok"
      ? "var(--pulse)"
      : check.state === "error"
        ? "var(--coral)"
        : check.state === "warn"
          ? "var(--amber)"
          : "var(--ink-5)";
  return (
    <div className="flex items-start gap-2">
      <span
        className="rounded-full flex-shrink-0 mt-0.5"
        style={{ width: 8, height: 8, backgroundColor: dotColor }}
      />
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold" style={{ color: "white" }}>
          {check.label}
        </div>
        <div className="text-[11px] truncate" style={{ color: "var(--ink-5)" }}>
          {check.detail}
        </div>
      </div>
    </div>
  );
}

function ScheduleNextCta({ onSchedule }) {
  return (
    <div
      className="rounded-2xl bg-white p-6 flex items-center justify-between gap-4"
      style={{ border: "1px solid var(--line)", borderStyle: "dashed" }}
    >
      <div>
        <div className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>
          No upcoming round scheduled
        </div>
        <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
          Schedule the next round to send invitations to your board members.
        </div>
      </div>
      <button onClick={onSchedule} className="btn-pulse" type="button">
        Schedule your next round →
      </button>
    </div>
  );
}

function LiveRoundCard({ round, onClose, closing, onView }) {
  const responses = round.responses_completed || 0;
  const invited = round.members_invited || round.invitations_sent || 0;
  const pct = invited > 0 ? Math.round((responses / invited) * 100) : 0;
  return (
    <div
      className="rounded-2xl bg-white p-5 grid gap-4 items-center"
      style={{
        gridTemplateColumns: "auto 1fr auto",
        border: "1px solid var(--pulse-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <RoundBadge number={round.round_number} variant="live" />
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>
            Round {round.round_number}
          </span>
          <span
            className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5"
            style={{
              backgroundColor: "var(--pulse-tint)",
              color: "var(--pulse-deep)",
              letterSpacing: "0.06em",
            }}
          >
            ● Live
          </span>
        </div>
        <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
          {responses} of {invited} responded ({pct}%)
        </div>
        <div
          className="mt-2 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--paper-3)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: "var(--pulse)" }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <button onClick={onView} className="btn-pulse-sm" type="button">
          View results →
        </button>
        <button onClick={onClose} disabled={closing} className="btn-ghost-sm" type="button">
          {closing ? "Closing…" : "Close early"}
        </button>
      </div>
    </div>
  );
}

function CompletedRoundRow({ round, isLast, onClick }) {
  const row = roundShape(round);
  return (
    <button
      onClick={onClick}
      type="button"
      className="w-full grid items-center gap-4 px-5 py-4 text-left transition hover:bg-[var(--paper-2)]"
      style={{
        gridTemplateColumns: "auto 1.4fr 1fr auto auto 1.5fr auto",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <RoundBadge number={round.round_number} variant="concluded" />
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>
            {row.label}
          </span>
          <Pill variant="good">Concluded</Pill>
        </div>
        <div className="text-[11.5px] mt-0.5 font-mono" style={{ color: "var(--ink-3)" }}>
          {formatDateRange(row.start, row.end)}
        </div>
      </div>
      <div>
        <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          {row.pct ?? 0}%{" "}
          <span className="font-normal text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            ({row.responses}/{row.total})
          </span>
        </div>
        <div
          className="mt-1 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--paper-3)", width: 100 }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${row.pct ?? 0}%`, backgroundColor: "var(--ink)" }}
          />
        </div>
      </div>
      <div className="text-right" style={{ minWidth: 50 }}>
        <span className="font-mono font-bold text-[15px]" style={{ color: npsColor(row.nps) }}>
          {row.nps != null ? formatNps(row.nps) : "—"}
        </span>
        <div className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
          NPS
        </div>
      </div>
      <div
        className="flex items-center gap-1 text-[12px]"
        style={{ color: row.warnings > 0 ? "var(--coral)" : "var(--ink-4)" }}
        title={`${row.warnings || 0} active warning${row.warnings === 1 ? "" : "s"}`}
      >
        {row.warnings > 0 ? "🔥" : "—"}
        <span className="font-semibold">{row.warnings || 0}</span>
      </div>
      <div
        className="text-[12px] truncate"
        style={{ color: "var(--ink-3)" }}
        title={row.topConcern || ""}
      >
        {row.topConcern || "—"}
      </div>
      <span className="btn-pulse-sm" style={{ pointerEvents: "none" }}>
        View results →
      </span>
    </button>
  );
}

function PlannedRoundRow({
  round,
  isLast,
  isRescheduling,
  rescheduleDate,
  setRescheduleDate,
  onStartReschedule,
  onSubmitReschedule,
  onCancelReschedule,
}) {
  const sd = round.scheduled_date ? new Date(round.scheduled_date) : null;
  return (
    <div
      className="px-5 py-3 grid items-center gap-3"
      style={{
        gridTemplateColumns: "auto 1fr auto auto",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <RoundBadge number={round.round_number} variant="planned" />
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-[13.5px]" style={{ color: "var(--ink)" }}>
          Round {round.round_number}
        </span>
        <Pill variant="neutral">Planned</Pill>
        <span className="font-mono text-[12px]" style={{ color: "var(--ink-3)" }}>
          {sd
            ? sd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "—"}
        </span>
      </div>
      {isRescheduling ? (
        <>
          <input
            type="date"
            value={rescheduleDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className="text-[12px] px-2.5 py-1 rounded-md outline-none"
            style={{ border: "1px solid var(--line-2)" }}
          />
          <div className="flex gap-1.5">
            <button onClick={onSubmitReschedule} className="btn-pulse-sm" type="button">
              Save
            </button>
            <button onClick={onCancelReschedule} className="btn-ghost-sm" type="button">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <button onClick={onStartReschedule} className="btn-ghost-sm" type="button">
            Reschedule
          </button>
          <span style={{ width: 1 }} />
        </>
      )}
    </div>
  );
}

function ScheduleRoundModal({
  mode = "create",
  nextRoundNumber,
  defaultDate,
  defaultWindowDays = 21,
  audience,
  onCancel,
  onSubmit,
}) {
  // Backend now accepts window_days on both POST /custom and PATCH
  // /reschedule (see surveyRounds.js validateWindowDays — bounds 7..60).
  // The Round name field is still cosmetic — no backend column for it.
  const [name, setName] = useState(`Round ${nextRoundNumber}`);
  const [date, setDate] = useState(defaultDate);
  const [windowDays, setWindowDays] = useState(defaultWindowDays);
  const isConfigure = mode === "configure";
  const cadence = followUpCadence(windowDays);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3
          className="font-semibold mb-1"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
          }}
        >
          {isConfigure ? `Configure Round ${nextRoundNumber}` : "Schedule round"}
        </h3>
        <p className="text-[13px] mb-5" style={{ color: "var(--ink-3)" }}>
          {isConfigure
            ? `Adjust this round's settings before it launches. Resident follow-ups send at days ${cadence.first} and ${cadence.second} of the response window.`
            : "Add a one-off round to the calendar. Cadence-driven planned rounds adjust automatically when this is launched."}
        </p>

        <Field label="Round name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-[13.5px] rounded-lg outline-none"
            style={{ border: "1px solid var(--line-2)", color: "var(--ink)" }}
          />
        </Field>

        <Field label="Send date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 text-[13.5px] rounded-lg outline-none"
            style={{ border: "1px solid var(--line-2)", color: "var(--ink)" }}
          />
        </Field>

        <Field label="Response window (days)">
          <input
            type="number"
            min={7}
            max={60}
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="w-full px-3 py-2 text-[13.5px] rounded-lg outline-none"
            style={{ border: "1px solid var(--line-2)", color: "var(--ink)" }}
          />
          <p className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-4)" }}>
            Cadence: <span className="font-mono">Day 1</span> launch ·{" "}
            <span className="font-mono">Day {cadence.first + 1}</span> reminder ·{" "}
            <span className="font-mono">Day {cadence.second + 1}</span> reminder ·{" "}
            <span className="font-mono">Day {windowDays + 1}</span> closed
          </p>
        </Field>

        <Field label="Audience">
          <div
            className="px-3 py-2 text-[13px] rounded-lg flex items-center justify-between"
            style={{ backgroundColor: "var(--paper-2)", color: "var(--ink-2)" }}
          >
            <span>
              All board members
              {audience?.invitees != null
                ? ` · ${audience.invitees} invitees across ${audience.communities} communities`
                : ""}
            </span>
            <button
              type="button"
              className="text-[12px] underline"
              style={{ color: "var(--ink-3)" }}
              onClick={() =>
                alert(
                  "Audience customization is coming soon. For now, all active board members are invited."
                )
              }
            >
              Customize
            </button>
          </div>
        </Field>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="btn-ghost" type="button">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!date) {
                alert("Pick a send date.");
                return;
              }
              if (!Number.isInteger(windowDays) || windowDays < 7 || windowDays > 60) {
                alert("Response window must be between 7 and 60 days.");
                return;
              }
              onSubmit({ scheduled_date: date, window_days: windowDays });
            }}
            className="btn-pulse"
            type="button"
          >
            {isConfigure ? "Save changes" : "Schedule round"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmCloseModal({ round, closing, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3 className="font-semibold text-[16px] mb-2" style={{ color: "var(--ink)" }}>
          Close Round {round.round_number} early?
        </h3>
        <p className="text-[13.5px] mb-4" style={{ color: "var(--ink-3)" }}>
          Pending invitations will stop. The round is marked concluded immediately and AI insights
          run on the responses received so far.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost" type="button">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={closing} className="btn-pulse" type="button">
            {closing ? "Closing…" : "Close round"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Tiny shared bits
// ──────────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label
        className="block text-[11.5px] font-semibold uppercase mb-1.5"
        style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div className="flex items-center justify-between mb-3" style={{ marginTop: 8 }}>
      {children}
    </div>
  );
}

function Pill({ children, variant = "neutral" }) {
  const colors = {
    good: { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    warn: { bg: "var(--coral-tint)", color: "var(--coral)" },
    neutral: { bg: "var(--paper-3)", color: "var(--ink-3)" },
  }[variant];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase"
      style={{ backgroundColor: colors.bg, color: colors.color, letterSpacing: "0.06em" }}
    >
      {children}
    </span>
  );
}

function RoundBadge({ number, variant }) {
  const styles = {
    concluded: { bg: "var(--pulse)", color: "white", border: "none" },
    live: { bg: "var(--pulse)", color: "white", border: "none" },
    planned: {
      bg: "transparent",
      color: "var(--ink-4)",
      border: "1.5px dashed var(--line-2)",
    },
  }[variant] || { bg: "var(--paper-3)", color: "var(--ink-3)", border: "none" };
  return (
    <div
      className="rounded-full flex items-center justify-center font-medium"
      style={{
        width: 32,
        height: 32,
        backgroundColor: styles.bg,
        color: styles.color,
        border: styles.border,
        fontFamily: "var(--font-display)",
        fontSize: 14,
        flexShrink: 0,
      }}
    >
      {number}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function roundShape(r) {
  const responses = r.responses_completed || 0;
  const total = r.members_invited || r.invitations_sent || 0;
  const pct = total > 0 ? Math.round((responses / total) * 100) : 0;
  const nps = extractNps(r);
  const topConcern = extractTopConcern(r);
  return {
    label: `Round ${r.round_number}`,
    start: r.launched_at,
    end: r.concluded_at || r.closes_at,
    responses,
    total,
    pct,
    nps,
    warnings: r.active_alert_count || 0,
    topConcern,
  };
}

function extractNps(round) {
  if (typeof round.insights_json === "object" && round.insights_json) {
    const n = round.insights_json.nps_score;
    if (typeof n === "number") return n;
  }
  return null;
}

function extractTopConcern(round) {
  const ins = round.insights_json;
  if (!ins) return null;
  const findings = Array.isArray(ins.key_findings) ? ins.key_findings : [];
  const concerning = findings.find((f) => f.severity === "critical" || f.severity === "concerning");
  if (concerning?.finding) return concerning.finding;
  if (typeof ins.executive_summary === "string" && ins.executive_summary.length > 0) {
    const firstSentence = ins.executive_summary.split(/[.!?]/)[0];
    return firstSentence.trim();
  }
  return null;
}

function npsColor(nps) {
  if (nps == null) return "var(--ink-3)";
  if (nps >= 0) return "var(--pulse-deep)";
  if (nps >= -10) return "var(--amber)";
  return "var(--coral)";
}

function formatNps(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function formatDateRange(start, end) {
  if (!start) return "—";
  const fmt = (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!end) return fmt(start);
  return `${fmt(start)} → ${fmt(end)}`;
}

function formatRelative(iso) {
  if (!iso) return "never";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const ms = now - then;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function maxRoundNumber(rounds) {
  return rounds.reduce((m, r) => Math.max(m, r.round_number || 0), 0);
}

/**
 * Resident follow-up cadence — mirrors server/scheduler.js sendReminders().
 * Returns the elapsed-day numbers when each follow-up fires after launch.
 *
 * For window=21 (the new default): first=7, second=14 → calendar days
 * 8 and 15 (with launch on Day 1, close on Day 22).
 */
function followUpCadence(windowDays) {
  const w = Number(windowDays) > 0 ? Number(windowDays) : 21;
  return {
    first: Math.floor(w / 3),
    second: Math.floor((2 * w) / 3),
  };
}

function RefreshIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function defaultNextDate(rounds, cadence) {
  const latest = rounds
    .map((r) => r.scheduled_date || r.closes_at || r.launched_at)
    .filter(Boolean)
    .map((d) => new Date(d))
    .sort((a, b) => b - a)[0];
  const intervalDays = cadence === 4 ? 90 : 180;
  const base = latest || new Date();
  const d = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function truncate(s, max) {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Pending pick row on the Rounds landing page. Compact version of the
 * dashboard's RecommendedActionRow — same data shape, but Accept /
 * Reject only (no inline ActionDrawer flow; the user clicks "Open
 * round" to flesh out an accepted pick).
 *
 * Includes the same NPS-lift projection: 0.5 × affected_detractors /
 * total_respondents × 100 (conservative model: detractors most likely
 * become passives when the issue is addressed).
 */
function PendingPickRow({ pick, totalRespondents, isLast, onAccept, onReject, onOpenRound }) {
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

  const lift =
    typeof pick.affected_detractor_count === "number" && totalRespondents > 0
      ? Math.round((0.5 * pick.affected_detractor_count * 100) / totalRespondents)
      : null;

  return (
    <div
      className="grid items-start gap-4 px-5 py-3.5"
      style={{
        gridTemplateColumns: "1fr auto",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {priorityLabel && (
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: priorityColor, letterSpacing: "0.08em" }}
            >
              {priorityLabel}
            </span>
          )}
          {lift != null && lift > 0 && (
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
        <div
          className="font-semibold text-[13.5px]"
          style={{ color: "var(--ink)", lineHeight: 1.45 }}
        >
          {pick.action}
        </div>
        {pick.impact && (
          <div className="text-[12px] mt-1" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
            {pick.impact}
          </div>
        )}
        {lift != null && pick.affected_detractor_count != null && (
          <div className="text-[11px] mt-1.5" style={{ color: "var(--ink-4)" }}>
            Based on {pick.affected_detractor_count} detractors of {totalRespondents} respondents ·
            50% conversion to passive
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5" style={{ minWidth: 130 }}>
        <button onClick={onAccept} className="btn-pulse-sm" type="button">
          Accept
        </button>
        <button onClick={onReject} className="btn-ghost-sm" type="button">
          Reject
        </button>
        <button
          onClick={onOpenRound}
          className="text-[11px] underline"
          style={{ color: "var(--ink-4)" }}
          type="button"
        >
          See round detail
        </button>
      </div>
    </div>
  );
}
