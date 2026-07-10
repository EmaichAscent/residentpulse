import { useState, useEffect, useCallback, useRef } from "react";
import SuperAdminQuestionEditor from "./SuperAdminQuestionEditor";

/**
 * SuperAdmin → Surveys: the survey template builder (Zoho parity
 * Phase C2 — docs/ZOHO_PARITY_PLAN.md, per the approved builder
 * mockup).
 *
 * Layout:
 *   • Template cards row — the global Default + one per concierge
 *     client. Click to open in the editor below.
 *   • Template editor — Required / Contextual / Retired sections.
 *     Rows show trend badges (rounds with answers) so the cost of
 *     removing a question is visible BEFORE acting.
 *   • Remove ✕ on a question with history → the API answers 409 with
 *     suggestion:"retire" → we surface the retire-vs-keep choice.
 *     Retired questions keep identity; Re-add resumes the trend.
 *   • Publish snapshots the draft into an immutable version. Rounds
 *     reference versions, never drafts.
 *
 * API: /api/superadmin/surveys/* (Phase C1).
 */

const API = "/api/superadmin/surveys";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const ENTITY_LABELS = {
  company: "Company",
  manager: "Manager",
  bookkeeper: "Bookkeeper",
  community: "Community",
};

const FORMAT_LABELS = {
  nps: "NPS 0–10",
  likert5: "1–5 Likert",
  multi_select: "Multi-select",
  yes_no: "Yes / No",
  open_text: "Open text",
};

export default function SuperAdminSurveys() {
  const [templates, setTemplates] = useState([]);
  const [openTemplateId, setOpenTemplateId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [allQuestions, setAllQuestions] = useState([]);
  const [allTriggers, setAllTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const rows = await api("/templates");
      setTemplates(rows);
      return rows;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    try {
      const d = await api(`/templates/${id}`);
      setDetail(d);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [rows] = await Promise.all([
        loadTemplates(),
        api("/questions")
          .then(setAllQuestions)
          .catch(() => {}),
        api("/triggers")
          .then(setAllTriggers)
          .catch(() => {}),
      ]);
      if (rows.length > 0) {
        setOpenTemplateId(rows[0].id);
      }
      setLoading(false);
    })();
  }, [loadTemplates]);

  useEffect(() => {
    if (openTemplateId) loadDetail(openTemplateId);
    else setDetail(null);
  }, [openTemplateId, loadDetail]);

  const refresh = useCallback(async () => {
    await loadTemplates();
    if (openTemplateId) await loadDetail(openTemplateId);
  }, [loadTemplates, loadDetail, openTemplateId]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  };

  if (loading) {
    return <div style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading survey templates…</div>;
  }

  return (
    <div style={{ maxWidth: 1060 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 650,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Survey templates
        </h1>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "0 0 20px", maxWidth: 640 }}>
        One default for self-signup clients, bespoke templates for concierge clients. Published
        versions are frozen — rounds snapshot their template at launch, so edits here never touch a
        survey already in the field.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            background: "#FDF2F2",
            border: "1px solid #F5C6C6",
            color: "#9B2C2C",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            style={{
              marginLeft: 10,
              background: "none",
              border: "none",
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div
          style={{
            background: "var(--pulse-wash, #E8F5F1)",
            border: "1px solid var(--pulse)",
            color: "var(--pulse-deep)",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {notice}
        </div>
      )}

      {/* Template cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpenTemplateId(t.id)}
            style={{
              textAlign: "left",
              background: "white",
              border:
                t.id === openTemplateId ? "1.5px solid var(--pulse)" : "1px solid var(--line)",
              boxShadow: t.id === openTemplateId ? "0 0 0 3px var(--pulse-wash, #E8F5F1)" : "none",
              borderRadius: 12,
              padding: "13px 15px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span
              className="font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                color: t.is_default ? "var(--pulse-deep)" : "var(--ink-3)",
                background: t.is_default ? "var(--pulse-wash, #E8F5F1)" : "var(--paper-2)",
                border: t.is_default ? "none" : "1px solid var(--line)",
                borderRadius: 4,
                padding: "2px 7px",
                alignSelf: "flex-start",
              }}
            >
              {t.is_default ? "Default · Global" : "Concierge"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t.name}</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {t.client_name ? `${t.client_name} · ` : ""}
              {t.question_count} questions
              {t.latest_version ? ` · v${t.latest_version} published` : " · never published"}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowNewTemplate(true)}
          style={{
            border: "1.5px dashed var(--line)",
            borderRadius: 12,
            background: "transparent",
            color: "var(--ink-3)",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: "pointer",
            minHeight: 88,
          }}
        >
          + New template
        </button>
      </div>

      {detail && (
        <TemplateEditor
          detail={detail}
          allQuestions={allQuestions}
          allTriggers={allTriggers}
          onChanged={refresh}
          onFlash={flash}
          onError={setError}
        />
      )}

      {showNewTemplate && (
        <NewTemplateModal
          onCancel={() => setShowNewTemplate(false)}
          onCreated={async (id) => {
            setShowNewTemplate(false);
            await loadTemplates();
            setOpenTemplateId(id);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function TemplateEditor({ detail, allQuestions, allTriggers, onChanged, onFlash, onError }) {
  const [publishing, setPublishing] = useState(false);
  const [retirePrompt, setRetirePrompt] = useState(null); // {tqId, label, rounds}
  const [showLibrary, setShowLibrary] = useState(false);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [editingTriggers, setEditingTriggers] = useState(null); // tqId
  const libraryRef = useRef(null);

  const active = detail.questions.filter((q) => q.status === "active");
  const required = active.filter((q) => q.tier === "required");
  const contextual = active.filter((q) => q.tier === "contextual");
  const retired = detail.questions.filter((q) => q.status === "retired");
  const inTemplateIds = new Set(detail.questions.map((q) => q.question_id));
  const libraryQuestions = allQuestions.filter(
    (q) => !inTemplateIds.has(q.id) && q.status === "active"
  );

  useEffect(() => {
    const handler = (e) => {
      if (libraryRef.current && !libraryRef.current.contains(e.target)) setShowLibrary(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const publish = async () => {
    setPublishing(true);
    try {
      const result = await api(`/templates/${detail.id}/publish`, { method: "POST" });
      onFlash(
        `Published v${result.version_number} (${result.question_count} questions). Rounds launched from now on use this version.`
      );
      onChanged();
    } catch (err) {
      onError(err.data?.problems ? `${err.message}: ${err.data.problems.join(" ")}` : err.message);
    } finally {
      setPublishing(false);
    }
  };

  const updateTq = async (tqId, body, successMsg) => {
    try {
      await api(`/templates/${detail.id}/questions/${tqId}`, { method: "PUT", body });
      if (successMsg) onFlash(successMsg);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  const removeTq = async (q) => {
    try {
      await api(`/templates/${detail.id}/questions/${q.template_question_id}`, {
        method: "DELETE",
      });
      onFlash(`Removed "${q.label}" — it never collected answers, so nothing was lost.`);
      onChanged();
    } catch (err) {
      if (err.status === 409 && err.data?.suggestion === "retire") {
        setRetirePrompt({
          tqId: q.template_question_id,
          label: q.label,
          rounds: q.rounds_with_answers,
        });
      } else {
        onError(err.message);
      }
    }
  };

  const addQuestion = async (questionId) => {
    try {
      await api(`/templates/${detail.id}/questions`, {
        method: "POST",
        body: { question_id: questionId, tier: "contextual", sort_order: active.length },
      });
      setShowLibrary(false);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "20px 24px 24px",
      }}
    >
      {/* Editor header */}
      <div
        className="flex items-baseline flex-wrap"
        style={{ gap: 12, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 19,
            fontWeight: 650,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {detail.name}
        </h2>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--ink-3)",
            background: "var(--paper-2)",
            border: "1px solid var(--line)",
            padding: "2px 9px",
            borderRadius: 999,
          }}
        >
          {detail.versions?.length
            ? `v${detail.versions[0].version_number} published · draft in progress`
            : "draft — never published"}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-pulse-sm" onClick={publish} disabled={publishing}>
          {publishing
            ? "Publishing…"
            : `Publish v${(detail.versions?.[0]?.version_number ?? 0) + 1}`}
        </button>
      </div>

      <Section
        title="Required — asked in every session"
        hint="The app guarantees delivery. Respondents can skip; skips are recorded."
      >
        {required.length === 0 && <EmptyHint>No required questions yet.</EmptyHint>}
        {required.map((q) => (
          <QuestionRow
            key={q.template_question_id}
            q={q}
            allTriggers={allTriggers}
            editingTriggers={editingTriggers}
            setEditingTriggers={setEditingTriggers}
            onTierChange={(tier) => updateTq(q.template_question_id, { tier })}
            onTriggersChange={(trigger_ids, nps_band_max) =>
              updateTq(q.template_question_id, { trigger_ids, nps_band_max })
            }
            onRemove={() => removeTq(q)}
          />
        ))}
      </Section>

      <Section
        title="Contextual — AI asks at its discretion"
        hint="Fires only when trigger conditions match the conversation."
      >
        {contextual.length === 0 && <EmptyHint>No contextual questions yet.</EmptyHint>}
        {contextual.map((q) => (
          <QuestionRow
            key={q.template_question_id}
            q={q}
            allTriggers={allTriggers}
            editingTriggers={editingTriggers}
            setEditingTriggers={setEditingTriggers}
            onTierChange={(tier) => updateTq(q.template_question_id, { tier })}
            onTriggersChange={(trigger_ids, nps_band_max) =>
              updateTq(q.template_question_id, { trigger_ids, nps_band_max })
            }
            onRemove={() => removeTq(q)}
          />
        ))}
      </Section>

      {/* Add from library */}
      <div ref={libraryRef} style={{ position: "relative", marginTop: 14 }}>
        <button type="button" className="btn-ghost-sm" onClick={() => setShowLibrary((v) => !v)}>
          + Add from library
        </button>
        {showLibrary && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              width: 420,
              maxHeight: 320,
              overflowY: "auto",
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 12,
              boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))",
              padding: 8,
              zIndex: 20,
            }}
          >
            {libraryQuestions.length === 0 && (
              <EmptyHint>Every library question is already in this template.</EmptyHint>
            )}
            {libraryQuestions.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => addQuestion(q.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13.5,
                  color: "var(--ink)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span>
                  {q.label}{" "}
                  <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "monospace" }}>
                    {q.code}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                  {ENTITY_LABELS[q.entity_target]} · {FORMAT_LABELS[q.answer_format]}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setShowLibrary(false);
                setShowQuestionEditor(true);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 10px 4px",
                borderTop: "1px solid var(--line)",
                marginTop: 6,
                border: "none",
                borderRadius: 0,
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--pulse-deep)",
              }}
            >
              + Create a new question…
            </button>
          </div>
        )}
      </div>

      {showQuestionEditor && (
        <SuperAdminQuestionEditor
          templateId={detail.id}
          templateName={detail.name}
          allTriggers={allTriggers}
          onSaved={(q) => {
            setShowQuestionEditor(false);
            onFlash(`"${q.code}" created and added to this template.`);
            onChanged();
          }}
          onCancel={() => setShowQuestionEditor(false)}
        />
      )}

      {retired.length > 0 && (
        <Section
          title="Retired — history preserved, not asked"
          hint="Re-add any time; the trend line resumes."
        >
          {retired.map((q) => (
            <div
              key={q.template_question_id}
              className="flex items-center"
              style={{
                gap: 12,
                padding: "10px 14px",
                background: "var(--paper-2)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                marginBottom: 6,
                opacity: 0.7,
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flex: 1 }}>
                {q.label}{" "}
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "monospace" }}>
                  {q.code}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                    fontStyle: "italic",
                    marginLeft: 8,
                  }}
                >
                  {q.rounds_with_answers > 0
                    ? `${q.rounds_with_answers} round${q.rounds_with_answers === 1 ? "" : "s"} of history preserved`
                    : "no history"}
                </span>
              </span>
              <button
                type="button"
                className="btn-ghost-sm"
                onClick={() =>
                  updateTq(
                    q.template_question_id,
                    { status: "active" },
                    `"${q.label}" re-added — its trend line resumes next round.`
                  )
                }
              >
                Re-add
              </button>
            </div>
          ))}
        </Section>
      )}

      {retirePrompt && (
        <RetireModal
          prompt={retirePrompt}
          onRetire={async () => {
            await updateTq(
              retirePrompt.tqId,
              { status: "retired" },
              `"${retirePrompt.label}" retired — ${retirePrompt.rounds} round${retirePrompt.rounds === 1 ? "" : "s"} of history preserved. Re-add any time.`
            );
            setRetirePrompt(null);
          }}
          onKeep={() => setRetirePrompt(null)}
        />
      )}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }) {
  return (
    <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontStyle: "italic", padding: "6px 2px" }}>
      {children}
    </div>
  );
}

function QuestionRow({
  q,
  allTriggers,
  editingTriggers,
  setEditingTriggers,
  onTierChange,
  onTriggersChange,
  onRemove,
}) {
  const isEditing = editingTriggers === q.template_question_id;
  const [selectedTriggers, setSelectedTriggers] = useState(q.triggers?.map((t) => t.id) || []);
  const [npsBand, setNpsBand] = useState(q.nps_band_max ?? "");

  useEffect(() => {
    setSelectedTriggers(q.triggers?.map((t) => t.id) || []);
    setNpsBand(q.nps_band_max ?? "");
  }, [q.triggers, q.nps_band_max]);

  return (
    <div
      style={{
        padding: "11px 14px",
        background: "white",
        border: "1px solid var(--line)",
        borderRadius: 10,
        marginBottom: 6,
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{q.label}</span>
            <span style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "monospace" }}>
              {q.code}
            </span>
            <Chip>{ENTITY_LABELS[q.entity_target]}</Chip>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {FORMAT_LABELS[q.answer_format]}
            </span>
          </div>
          <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 5 }}>
            <TrendBadge rounds={q.rounds_with_answers} />
            {q.tier === "contextual" &&
              q.triggers?.map((t) => (
                <span
                  key={t.id}
                  title={t.description}
                  style={{
                    fontSize: 10.5,
                    color: "var(--ink-3)",
                    background: "var(--paper-2)",
                    border: "1px dashed var(--line)",
                    padding: "1.5px 8px",
                    borderRadius: 999,
                  }}
                >
                  {t.label}
                </span>
              ))}
            {q.tier === "contextual" && q.nps_band_max != null && (
              <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>NPS ≤ {q.nps_band_max}</span>
            )}
            {q.tier === "contextual" && (
              <button
                type="button"
                onClick={() => setEditingTriggers(isEditing ? null : q.template_question_id)}
                style={{
                  fontSize: 10.5,
                  color: "var(--pulse-deep)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                {isEditing ? "close" : "edit triggers"}
              </button>
            )}
          </div>
        </div>
        <select
          value={q.tier}
          onChange={(e) => onTierChange(e.target.value)}
          aria-label={`Tier for ${q.label}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 8px",
            borderRadius: 7,
            border: "1px solid var(--line)",
            background: "white",
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          <option value="required">Required</option>
          <option value="contextual">Contextual</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${q.label}`}
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "none",
            background: "none",
            color: "var(--ink-3)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {isEditing && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px dashed var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {allTriggers.map((t) => {
              const on = selectedTriggers.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.description}
                  onClick={() =>
                    setSelectedTriggers((prev) =>
                      on ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                    )
                  }
                  style={{
                    fontSize: 12,
                    fontWeight: on ? 600 : 500,
                    padding: "5px 11px",
                    borderRadius: 999,
                    cursor: "pointer",
                    background: on ? "var(--pulse-wash, #E8F5F1)" : "white",
                    color: on ? "var(--pulse-deep)" : "var(--ink-3)",
                    border: on ? "1px solid var(--pulse)" : "1px dashed var(--line)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <label style={{ fontSize: 12, color: "var(--ink-3)" }}>
              …and NPS is{" "}
              <select
                value={npsBand}
                onChange={(e) => setNpsBand(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: "3px 6px",
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                }}
              >
                <option value="">any score</option>
                <option value="6">6 or below</option>
                <option value="8">8 or below</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-pulse-sm"
              onClick={() => {
                onTriggersChange(selectedTriggers, npsBand === "" ? null : Number(npsBand));
                setEditingTriggers(null);
              }}
            >
              Save triggers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }) {
  return (
    <span
      className="font-semibold uppercase"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.04em",
        padding: "1.5px 7px",
        borderRadius: 4,
        background: "var(--paper-2)",
        color: "var(--ink-3)",
        border: "1px solid var(--line)",
      }}
    >
      {children}
    </span>
  );
}

function TrendBadge({ rounds }) {
  const has = rounds > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        color: has ? "var(--pulse-deep)" : "var(--ink-3)",
        background: has ? "var(--pulse-wash, #E8F5F1)" : "var(--paper-2)",
        padding: "1.5px 8px",
        borderRadius: 999,
      }}
    >
      {has ? `${rounds} round${rounds === 1 ? "" : "s"} of data` : "New — no history yet"}
    </span>
  );
}

function RetireModal({ prompt, onRetire, onKeep }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onKeep}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.2))" }}
        role="alertdialog"
        aria-label="Question has trend data"
      >
        <h3 style={{ fontSize: 16, fontWeight: 650, color: "var(--ink)", margin: "0 0 10px" }}>
          ⚠ "{prompt.label}" has {prompt.rounds} round{prompt.rounds === 1 ? "" : "s"} of trend data
        </h3>
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5, margin: "0 0 16px" }}>
          Removing it would end that trend line on the dashboard. <strong>Retiring</strong> stops
          asking but keeps every data point — and if you re-add it later, the trend resumes where it
          left off.
        </p>
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="btn-ghost-sm" onClick={onKeep}>
            Keep it
          </button>
          <button type="button" className="btn-pulse-sm" onClick={onRetire}>
            Retire (keep history)
          </button>
        </div>
      </div>
    </div>
  );
}

function NewTemplateModal({ onCancel, onCreated, onError }) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState([]);

  useEffect(() => {
    fetch("/api/superadmin/clients", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const result = await api("/templates", {
        method: "POST",
        body: { name: name.trim(), client_id: clientId ? Number(clientId) : null },
      });
      onCreated(result.id);
    } catch (err) {
      onError(err.message);
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.2))" }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 650, color: "var(--ink)", margin: "0 0 14px" }}>
          New template
        </h3>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          Template name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cadden — Board Survey"
          style={{
            width: "100%",
            fontSize: 14,
            padding: "8px 12px",
            borderRadius: 9,
            border: "1px solid var(--line)",
            marginBottom: 14,
          }}
        />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          Client (leave blank for a global template)
        </label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={{
            width: "100%",
            fontSize: 14,
            padding: "8px 12px",
            borderRadius: 9,
            border: "1px solid var(--line)",
            marginBottom: 18,
            background: "white",
          }}
        >
          <option value="">— Global —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="btn-ghost-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-pulse-sm" onClick={create}>
            Create template
          </button>
        </div>
      </div>
    </div>
  );
}
