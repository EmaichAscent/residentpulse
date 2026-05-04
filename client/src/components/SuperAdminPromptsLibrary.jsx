import { useState, useEffect } from "react";
import { diffLines, diffStats } from "../utils/lineDiff";
import SuperAdminTestInterview from "./SuperAdminTestInterview";

/**
 * SuperAdmin Prompts Library — read-only structured-block view of the
 * three platform prompts (board interview, client onboarding,
 * supplement generator). PR 3 of the SuperAdmin Prompts Library
 * overhaul series.
 *
 * Renders blocks as kind-tinted cards per the handoff §4 layout:
 *   • persona  → green    — "who you are / what you do"
 *   • phase    → plum     — sequenced phases (onboarding only)
 *   • rules    → white    — standard instructions
 *   • critical → amber    — non-negotiable / safety, with red CRITICAL pill
 *
 * Two-column body: blocks on the left (1fr), right rail (320px) with
 * the "Recent versions" history.
 *
 * Data sources (server PR 2):
 *   GET /api/superadmin/prompts/:key/blocks
 *     → { prompt_key, prompt_text, blocks, version_number, label,
 *         note, created_by, created_at }
 *   GET /api/superadmin/prompt/versions?key=:key
 *     → existing endpoint — returns all versions for that key
 *
 * Edit + diff modal land in PR 4. This PR is intentionally read-only
 * so the structure can be reviewed before destructive actions land.
 */

const PROMPT_TABS = [
  {
    key: "system_prompt",
    label: "Board interview",
    subtitle: "Runs every board-member NPS interview. Client supplement is appended automatically.",
  },
  {
    key: "interview_initial_prompt",
    label: "Client onboarding",
    subtitle:
      "The conversation a new client admin has during initial setup. Output feeds the supplement generator.",
  },
  {
    key: "prompt_generation_instruction",
    label: "Supplement generator",
    subtitle:
      "Converts onboarding output into a tactical per-client brief that the board AI uses every session.",
  },
];

export default function SuperAdminPromptsLibrary() {
  const [activeKey, setActiveKey] = useState(PROMPT_TABS[0].key);
  const [current, setCurrent] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editing state. The editor is per-block (only one block can be in
  // edit mode at a time — keeps the save flow obvious). On save we
  // PUT the entire updated blocks array, so unchanged blocks keep
  // their existing body verbatim.
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ heading: "", body: "" });
  const [savingNote, setSavingNote] = useState(null); // { blockIndex, note } | null
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // Diff modal state — opened from the Recent Versions card.
  // diffTarget = { fromVersion, toVersion } where each side is a full
  // version object (or null/{} for "current live"). Set by clicking
  // Compare on a row in the versions list.
  const [diffTarget, setDiffTarget] = useState(null);
  const [rollingBack, setRollingBack] = useState(false);

  // Test interview modal — scripted persona runs that show which
  // prompt rule fired on each AI message. Opened from the page header.
  const [testOpen, setTestOpen] = useState(false);

  // Defensive JSON fetcher — when the server's SPA fallback catches an
  // unmatched API path it returns 200 + index.html, which makes
  // `r.ok ? r.json() : ...` fail with the cryptic "Unexpected token '<'"
  // parser error. We check content-type first so a typo'd URL surfaces
  // as "Endpoint not found" instead.
  const fetchJSON = async (url) => {
    const r = await fetch(url, { credentials: "include" });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) {
      throw new Error(`${r.status} ${r.statusText} — ${url}`);
    }
    if (!ct.includes("application/json")) {
      throw new Error(
        `Expected JSON from ${url} but got ${ct || "no content-type"}. ` +
          `The route may not exist on the server.`
      );
    }
    return r.json();
  };

  const reload = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJSON(`/api/superadmin/prompts/${activeKey}/blocks`),
      fetchJSON(`/api/superadmin/prompt/versions?key=${activeKey}`).catch(() => []),
    ])
      .then(([blocksData, versionsData]) => {
        setCurrent(blocksData);
        setVersions(Array.isArray(versionsData) ? versionsData : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJSON(`/api/superadmin/prompts/${activeKey}/blocks`),
      fetchJSON(`/api/superadmin/prompt/versions?key=${activeKey}`).catch(() => []),
    ])
      .then(([blocksData, versionsData]) => {
        if (cancelled) return;
        setCurrent(blocksData);
        setVersions(Array.isArray(versionsData) ? versionsData : []);
        // Reset all editing state on tab change.
        setEditingIndex(null);
        setSavingNote(null);
        setSavedAt(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  const activeTab = PROMPT_TABS.find((t) => t.key === activeKey);

  // ── Edit handlers ────────────────────────────────────────────────
  const startEdit = (index) => {
    const block = current.blocks[index];
    setEditingDraft({ heading: block.heading, body: block.body });
    setEditingIndex(index);
    setSavedAt(null);
  };
  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingDraft({ heading: "", body: "" });
  };
  const requestSave = () => {
    setSavingNote({ blockIndex: editingIndex, note: "" });
  };
  const confirmSave = async (note) => {
    if (editingIndex == null) return;
    setSaving(true);
    try {
      const updatedBlocks = current.blocks.map((b, i) =>
        i === editingIndex ? { ...b, heading: editingDraft.heading, body: editingDraft.body } : b
      );
      const res = await fetch(`/api/superadmin/prompts/${activeKey}/blocks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          blocks: updatedBlocks,
          note: note || null,
          label: "Edited via structured editor",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      setEditingIndex(null);
      setSavingNote(null);
      setSavedAt(Date.now());
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Rollback handler ────────────────────────────────────────────
  const handleRollback = async (versionId) => {
    if (!versionId) return;
    if (
      !window.confirm(
        "Roll back to this version? The current value will be auto-saved as a new version first so this is reversible."
      )
    )
      return;
    setRollingBack(true);
    try {
      const res = await fetch(`/api/superadmin/prompt/versions/${versionId}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Rollback failed");
      }
      setDiffTarget(null);
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div
      className="space-y-3.5"
      data-testid="superadmin-prompts-library"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
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
            Prompt library
          </h1>
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
            Every AI conversation on the platform runs on these three prompts. Read carefully —
            edits land in production immediately.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTestOpen(true)}
          style={pulseBtnStyle}
          title="Run a scripted persona against the live prompts"
        >
          Test interview →
        </button>
      </div>

      {/* Sub-tabs (Board / Onboarding / Supplement) */}
      <div className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
        {PROMPT_TABS.map((t) => {
          const active = activeKey === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              className="font-semibold transition"
              style={{
                padding: "10px 18px",
                fontSize: 13,
                color: active ? "var(--ink)" : "var(--ink-3)",
                borderBottom: active ? "2px solid var(--pulse)" : "2px solid transparent",
                marginBottom: -1,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab subtitle */}
      <p className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)", marginBottom: 12 }}>
        {activeTab?.subtitle}
      </p>

      {loading && (
        <p className="text-center py-10" style={{ color: "var(--ink-4)" }}>
          Loading…
        </p>
      )}
      {error && (
        <p className="text-center py-10" style={{ color: "var(--coral)" }}>
          {error}
        </p>
      )}

      {!loading && !error && current && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 320px" }}>
          {/* Left: structured blocks */}
          <div className="flex flex-col" style={{ gap: 12 }}>
            <PromptHeaderCard current={current} savedAt={savedAt} />
            {current.blocks?.length === 0 ? (
              <Card>
                <p className="text-[13px]" style={{ color: "var(--ink-4)" }}>
                  No blocks parsed for this prompt. (Settings value may be empty.)
                </p>
              </Card>
            ) : (
              current.blocks.map((block, i) => (
                <BlockCard
                  key={i}
                  block={block}
                  index={i + 1}
                  isEditing={editingIndex === i}
                  draft={editingIndex === i ? editingDraft : null}
                  onDraftChange={setEditingDraft}
                  onStartEdit={() => startEdit(i)}
                  onCancelEdit={cancelEdit}
                  onRequestSave={requestSave}
                  saving={saving}
                  anyOtherEditing={editingIndex != null && editingIndex !== i}
                />
              ))
            )}
          </div>

          {/* Right rail */}
          <div className="flex flex-col" style={{ gap: 12 }}>
            <RecentVersionsCard
              versions={versions}
              currentText={current.prompt_text}
              onCompare={(v) =>
                setDiffTarget({
                  fromVersion: v,
                  toVersion: { ...current, label: "Current (live)" },
                })
              }
            />
            <PerformancePlaceholderCard />
          </div>
        </div>
      )}

      {/* Save-confirmation modal — collects an optional commit note. */}
      {savingNote && (
        <SaveNoteModal
          saving={saving}
          onCancel={() => setSavingNote(null)}
          onConfirm={(note) => confirmSave(note)}
        />
      )}

      {/* Side-by-side version diff modal. */}
      {diffTarget && (
        <VersionDiffModal
          fromVersion={diffTarget.fromVersion}
          toVersion={diffTarget.toVersion}
          rollingBack={rollingBack}
          onRollback={() => handleRollback(diffTarget.fromVersion?.id)}
          onClose={() => setDiffTarget(null)}
        />
      )}

      {/* Scripted persona test-interview modal. */}
      <SuperAdminTestInterview open={testOpen} onClose={() => setTestOpen(false)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

/**
 * PromptHeaderCard — surfaces the live version metadata at the top of
 * the blocks column. Pulled from getCurrentBlocks() which best-effort
 * matches the live settings.value to a prompt_versions row.
 */
function PromptHeaderCard({ current, savedAt }) {
  const { version_number, label, created_by, created_at, blocks, prompt_text } = current;
  const showJustSaved = savedAt && Date.now() - savedAt < 4000;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            {version_number != null ? `Version ${version_number}` : "Live (untracked version)"}
          </span>
          {label && (
            <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              · {label}
            </span>
          )}
          {showJustSaved && (
            <span
              className="text-[10px] font-bold uppercase"
              style={{
                backgroundColor: "var(--pulse-soft)",
                color: "var(--pulse-deep)",
                padding: "2px 7px",
                borderRadius: 999,
                letterSpacing: "0.08em",
              }}
            >
              Saved ✓
            </span>
          )}
        </div>
        <div className="text-[11.5px] font-mono" style={{ color: "var(--ink-4)" }}>
          {blocks.length} block{blocks.length === 1 ? "" : "s"} ·{" "}
          {prompt_text.length.toLocaleString()} chars
        </div>
      </div>
      {(created_by || created_at) && (
        <div className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-4)" }}>
          {created_by && <>Last edited by {created_by}</>}
          {created_by && created_at && " · "}
          {created_at && <span className="font-mono">{formatRelativeTime(created_at)}</span>}
        </div>
      )}
    </Card>
  );
}

/**
 * BlockCard — single structured-block render. Tint + label vary by
 * kind per the handoff §4 design tokens.
 *
 * Edit mode: when isEditing is true, the body becomes a textarea and
 * the heading becomes an inline input. Save / Cancel buttons appear
 * at the bottom of the card. Save bubbles up via onRequestSave so the
 * parent can prompt for an optional commit note before PUT-ing.
 */
function BlockCard({
  block,
  index,
  isEditing,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onRequestSave,
  saving,
  anyOtherEditing,
}) {
  const tone = TONE_FOR_KIND[block.kind] || TONE_FOR_KIND.rules;
  const heading = isEditing ? (draft?.heading ?? block.heading) : block.heading;
  const body = isEditing ? (draft?.body ?? block.body) : block.body;

  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: tone.bg,
        border: `1px solid ${isEditing ? "var(--ink)" : tone.border}`,
        padding: "14px 16px",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>
            {String(index).padStart(2, "0")}
          </span>
          {isEditing ? (
            <input
              type="text"
              value={heading}
              onChange={(e) => onDraftChange({ ...draft, heading: e.target.value })}
              className="font-bold uppercase"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.12em",
                color: tone.label,
                background: "white",
                border: "1px solid var(--line-2)",
                borderRadius: 6,
                padding: "3px 6px",
                outline: "none",
                minWidth: 240,
              }}
            />
          ) : (
            <span
              className="font-bold uppercase"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.12em",
                color: tone.label,
              }}
            >
              {heading || "(untitled section)"}
            </span>
          )}
        </div>
        <KindPill kind={block.kind} />
      </div>

      {isEditing ? (
        <textarea
          value={body}
          onChange={(e) => onDraftChange({ ...draft, body: e.target.value })}
          rows={Math.max(6, body.split("\n").length + 1)}
          className="w-full whitespace-pre-wrap"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            lineHeight: 1.65,
            color: "var(--ink)",
            background: "white",
            border: "1px solid var(--line-2)",
            borderRadius: 8,
            padding: "10px 12px",
            outline: "none",
            resize: "vertical",
          }}
        />
      ) : (
        <pre
          className="whitespace-pre-wrap"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            lineHeight: 1.65,
            color: "var(--ink-2)",
            margin: 0,
          }}
        >
          {body}
        </pre>
      )}

      <div
        className="flex items-center justify-between mt-3"
        style={{
          paddingTop: isEditing ? 12 : 0,
          borderTop: isEditing ? "1px dashed var(--line-2)" : "none",
        }}
      >
        {isEditing ? (
          <>
            <span className="text-[11px] font-mono" style={{ color: "var(--ink-4)" }}>
              {body.length.toLocaleString()} chars · {body.split("\n").length} lines
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={onCancelEdit} disabled={saving} style={ghostBtnStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={onRequestSave}
                disabled={saving}
                style={primaryBtnStyle}
              >
                Save block →
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[11px] font-mono" style={{ color: "var(--ink-5)" }}>
              {body.length.toLocaleString()} chars · {body.split("\n").length} lines
            </span>
            <button
              type="button"
              onClick={onStartEdit}
              disabled={anyOtherEditing}
              style={ghostBtnStyle}
              title={anyOtherEditing ? "Save or cancel the other edit first" : "Edit this block"}
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const ghostBtnStyle = {
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  background: "white",
  color: "var(--ink-2)",
  border: "1px solid var(--line-2)",
  cursor: "pointer",
};

const primaryBtnStyle = {
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  background: "var(--ink)",
  color: "white",
  border: "1px solid var(--ink)",
  cursor: "pointer",
};

const TONE_FOR_KIND = {
  persona: {
    bg: "var(--pulse-tint)",
    border: "var(--pulse-soft)",
    label: "var(--pulse-deep)",
  },
  phase: {
    bg: "var(--plum-tint)",
    border: "var(--plum-soft)",
    label: "var(--plum)",
  },
  rules: {
    bg: "white",
    border: "var(--line)",
    label: "var(--ink-3)",
  },
  critical: {
    bg: "var(--amber-tint)",
    border: "var(--amber-soft)",
    label: "#8C5E1F",
  },
};

function KindPill({ kind }) {
  const style = (() => {
    switch (kind) {
      case "persona":
        return { bg: "var(--pulse-soft)", color: "var(--pulse-deep)", label: "PERSONA" };
      case "phase":
        return { bg: "var(--plum-soft)", color: "var(--plum)", label: "PHASE" };
      case "critical":
        return { bg: "var(--coral-soft)", color: "var(--coral)", label: "CRITICAL" };
      default:
        return { bg: "var(--paper-3)", color: "var(--ink-3)", label: "RULES" };
    }
  })();
  return (
    <span
      className="font-bold uppercase"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 9.5,
        letterSpacing: "0.08em",
      }}
    >
      {style.label}
    </span>
  );
}

/**
 * RecentVersionsCard — last N versions of the active prompt key.
 * Uses the existing /prompt/versions endpoint which returns all
 * versions newest-first; we cap rendering at 6.
 */
function RecentVersionsCard({ versions, currentText, onCompare }) {
  const top = versions.slice(0, 6);
  return (
    <Card>
      <SectionEyebrow>Recent versions</SectionEyebrow>
      {top.length === 0 ? (
        <p className="text-[12.5px] mt-2" style={{ color: "var(--ink-4)" }}>
          No saved versions yet for this prompt.
        </p>
      ) : (
        <div className="flex flex-col mt-2" style={{ gap: 0 }}>
          {top.map((v, i) => {
            const isCurrent = v.prompt_text === currentText;
            return (
              <div
                key={v.id}
                className="py-2.5"
                style={{
                  borderBottom: i < top.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-semibold text-[12.5px]"
                    style={{
                      color: isCurrent ? "var(--pulse-deep)" : "var(--ink)",
                    }}
                  >
                    {v.version_number != null ? `v${v.version_number}` : "—"}
                    {v.label && (
                      <span className="font-normal ml-1.5" style={{ color: "var(--ink-3)" }}>
                        · {v.label}
                      </span>
                    )}
                  </span>
                  {isCurrent && (
                    <span
                      className="text-[9.5px] font-bold uppercase"
                      style={{
                        backgroundColor: "var(--pulse-soft)",
                        color: "var(--pulse-deep)",
                        padding: "2px 7px",
                        borderRadius: 999,
                        letterSpacing: "0.08em",
                      }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-4)" }}>
                  {v.created_by || "—"} · {formatRelativeTime(v.created_at)}
                </div>
                {v.note && (
                  <p
                    className="text-[12px] mt-1 italic"
                    style={{ color: "var(--ink-3)", lineHeight: 1.4 }}
                  >
                    “{v.note}”
                  </p>
                )}
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onCompare?.(v)}
                    className="text-[11.5px] mt-1.5 font-semibold underline"
                    style={{ color: "var(--ink-3)" }}
                  >
                    Compare to current →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * PerformancePlaceholderCard — handoff §4 specifies this card with
 * three live metrics (Avg response length, Vague answers re-probed,
 * Interview completion). Those metrics aren't computed yet — placeholder
 * for PR 5 (Test Interview modal) which will compute them from
 * scripted-persona runs.
 */
function PerformancePlaceholderCard() {
  return (
    <Card>
      <SectionEyebrow>Performance</SectionEyebrow>
      <p className="text-[12px] mt-2" style={{ color: "var(--ink-4)" }}>
        Per-version metrics (avg response length, vague-answer re-probe rate, interview completion)
        will land alongside the Test Interview modal in a later PR.
      </p>
    </Card>
  );
}

function Card({ children }) {
  return (
    <div
      className="rounded-xl bg-white"
      style={{
        border: "1px solid var(--line)",
        padding: 16,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}

function SectionEyebrow({ children }) {
  return (
    <div
      className="font-bold uppercase"
      style={{
        fontSize: 11,
        letterSpacing: "0.12em",
        color: "var(--ink-4)",
      }}
    >
      {children}
    </div>
  );
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}

// ──────────────────────────────────────────────────────────────────────
// Modals
// ──────────────────────────────────────────────────────────────────────

/**
 * SaveNoteModal — collects an optional commit-style note before the
 * block save POSTs. The note shows up in the version history list so
 * later operators understand WHY a version was created.
 */
function SaveNoteModal({ saving, onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(11,27,43,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          width: "100%",
          padding: 24,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h3
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
            marginBottom: 6,
          }}
        >
          Save block change
        </h3>
        <p className="text-[12.5px]" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
          A new version will be logged immediately and the live prompt is updated. The previous live
          value is auto-saved as a separate version so this is reversible.
        </p>
        <label
          className="block text-[10.5px] font-bold uppercase mb-1.5"
          style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
        >
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. tightened the depth-budget rule for detractors"
          className="w-full"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "var(--ink)",
            background: "var(--paper)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
            padding: "10px 12px",
            outline: "none",
            resize: "vertical",
          }}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} disabled={saving} style={ghostBtnStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(note)}
            disabled={saving}
            style={pulseBtnStyle}
          >
            {saving ? "Saving…" : "Save & publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

const pulseBtnStyle = {
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  background: "var(--pulse)",
  color: "white",
  border: "1px solid var(--pulse)",
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
};

/**
 * VersionDiffModal — side-by-side comparison of two prompt versions.
 *
 * fromVersion = older / target-of-rollback
 * toVersion   = newer / "current (live)" by default
 *
 * Layout per the handoff §"Version diff modal":
 *   • Wide modal (max-w 1100px)
 *   • Two columns. Left header tinted paper-2; right header tinted pulse-tint.
 *   • Removed lines: coral-tint background. Added lines: leaf-tint background.
 *   • Footer: "Roll back to vN" (left, ghost) + "Close" (right, ghost).
 */
function VersionDiffModal({ fromVersion, toVersion, rollingBack, onRollback, onClose }) {
  const fromText = fromVersion?.prompt_text || "";
  const toText = toVersion?.prompt_text || "";
  const { left, right } = diffLines(fromText, toText);
  const stats = diffStats(fromText, toText);

  const fromLabel =
    fromVersion?.version_number != null
      ? `v${fromVersion.version_number}`
      : fromVersion?.label || "Older";
  const toLabel =
    toVersion?.version_number != null
      ? `v${toVersion.version_number}`
      : toVersion?.label || "Current";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(11,27,43,0.55)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 1100,
          width: "100%",
          maxHeight: "90vh",
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <h3
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              letterSpacing: "-0.015em",
              color: "var(--ink)",
            }}
          >
            Compare versions
          </h3>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
            <span className="font-mono">{fromLabel}</span> →{" "}
            <span className="font-mono">{toLabel}</span> · {stats.added} added, {stats.removed}{" "}
            removed
          </p>
        </div>

        {/* Side-by-side body */}
        <div className="flex" style={{ flex: 1, minHeight: 0 }}>
          <DiffColumn
            title={fromLabel}
            subtitle={fromVersion?.label || ""}
            tone="from"
            rows={left}
          />
          <div style={{ width: 1, background: "var(--line)" }} />
          <DiffColumn title={toLabel} subtitle={toVersion?.label || ""} tone="to" rows={right} />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--line)",
            background: "var(--paper)",
            flexShrink: 0,
          }}
        >
          {fromVersion?.id ? (
            <button
              type="button"
              onClick={onRollback}
              disabled={rollingBack}
              style={{
                ...ghostBtnStyle,
                color: "var(--coral)",
                borderColor: "var(--coral-soft)",
              }}
            >
              {rollingBack ? "Rolling back…" : `Roll back to ${fromLabel}`}
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} style={ghostBtnStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffColumn({ title, subtitle, tone, rows }) {
  const headerBg = tone === "to" ? "var(--pulse-tint)" : "var(--paper-2)";
  const headerColor = tone === "to" ? "var(--pulse-deep)" : "var(--ink-2)";
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          background: headerBg,
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
        }}
      >
        <span
          className="font-bold uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            color: headerColor,
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-[11.5px] ml-2" style={{ color: "var(--ink-4)" }}>
            · {subtitle}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "white",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <tbody>
            {rows.map((row, i) => {
              const isPadding = row.kind === "" && row.text === "";
              return (
                <tr
                  key={i}
                  style={{
                    background:
                      row.kind === "added"
                        ? "var(--pulse-tint)"
                        : row.kind === "removed"
                          ? "var(--coral-tint)"
                          : isPadding
                            ? // Padding row marker — "no content on this side at this
                              // position." Striped tint keeps the row visible so a
                              // wildly mismatched diff (24 vs 268 lines) doesn't
                              // render as an empty column.
                              "repeating-linear-gradient(135deg, var(--paper-2) 0 6px, var(--paper) 6px 12px)"
                            : "transparent",
                  }}
                >
                  <td
                    style={{
                      width: 36,
                      textAlign: "right",
                      padding: "1px 8px",
                      color: "var(--ink-5)",
                      fontSize: 10.5,
                      userSelect: "none",
                      borderRight: "1px solid var(--line)",
                    }}
                  >
                    {isPadding ? "" : i + 1}
                  </td>
                  <td
                    style={{
                      padding: "1px 10px",
                      color:
                        row.kind === "added"
                          ? "var(--pulse-deep)"
                          : row.kind === "removed"
                            ? "var(--coral)"
                            : isPadding
                              ? "var(--ink-5)"
                              : "var(--ink-2)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontStyle: isPadding ? "italic" : "normal",
                      opacity: isPadding ? 0.6 : 1,
                    }}
                  >
                    {row.kind === "added"
                      ? "+ "
                      : row.kind === "removed"
                        ? "− "
                        : isPadding
                          ? "·  "
                          : "  "}
                    {isPadding ? "(no line on this side)" : row.text || " "}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
