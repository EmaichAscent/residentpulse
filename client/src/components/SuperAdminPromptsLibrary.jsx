import { useState, useEffect } from "react";

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
 *   GET /api/superadmin/prompt-versions?key=:key
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/superadmin/prompts/${activeKey}/blocks`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load prompt")))),
      fetch(`/api/superadmin/prompt-versions?key=${activeKey}`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([blocksData, versionsData]) => {
        if (cancelled) return;
        setCurrent(blocksData);
        setVersions(Array.isArray(versionsData) ? versionsData : []);
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
            <PromptHeaderCard current={current} />
            {current.blocks?.length === 0 ? (
              <Card>
                <p className="text-[13px]" style={{ color: "var(--ink-4)" }}>
                  No blocks parsed for this prompt. (Settings value may be empty.)
                </p>
              </Card>
            ) : (
              current.blocks.map((block, i) => <BlockCard key={i} block={block} index={i + 1} />)
            )}
          </div>

          {/* Right rail */}
          <div className="flex flex-col" style={{ gap: 12 }}>
            <RecentVersionsCard versions={versions} currentVersionId={null} />
            <PerformancePlaceholderCard />
          </div>
        </div>
      )}
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
function PromptHeaderCard({ current }) {
  const { version_number, label, created_by, created_at, blocks, prompt_text } = current;
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
 */
function BlockCard({ block, index }) {
  const tone = TONE_FOR_KIND[block.kind] || TONE_FOR_KIND.rules;
  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: tone.bg,
        border: `1px solid ${tone.border}`,
        padding: "14px 16px",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>
            {String(index).padStart(2, "0")}
          </span>
          <span
            className="font-bold uppercase"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.12em",
              color: tone.label,
            }}
          >
            {block.heading || "(untitled section)"}
          </span>
        </div>
        <KindPill kind={block.kind} />
      </div>
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
        {block.body}
      </pre>
    </div>
  );
}

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
 * Uses the existing /prompt-versions endpoint which returns all
 * versions newest-first; we cap rendering at 6.
 */
function RecentVersionsCard({ versions, currentVersionId }) {
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
            const isCurrent = v.id === currentVersionId;
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
