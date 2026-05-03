import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArchiveIconButton,
  ArchiveModal,
  ImportResultModal,
  SearchInput,
  FilterSelect,
  FieldInput,
  ViewToggle,
} from "./Members";

/**
 * Communities — full rebuild matching DESIGN/design_handoff_clientapp/
 * src/screens/Communities.jsx (the risk-first sortable table).
 *
 *   Header: title + count + Export CSV / Import / Add community
 *   Filters: search, Region, Manager, Type, Sort
 *   Table columns:
 *     • risk indicator (🔥 if NPS ≤ -10, 🌱 if NPS ≥ +25)
 *     • Community + type + member count
 *     • Manager / region
 *     • NPS sentiment bar (D/P/Pr split)
 *     • NPS score
 *     • ARR (contract value, coral-tinted on at-risk rows)
 *     • Issue (friendly label from the alert_type enum)
 *     • Edit (inline) + Archive
 *
 * Data comes from two endpoints, merged client-side:
 *   GET /api/admin/communities                 — name, type, manager,
 *                                                region, member count
 *   GET /api/admin/survey-rounds/:id/dashboard — community_cohorts for
 *                                                latest concluded round
 *                                                (median NPS, sentiment
 *                                                counts) — merged by name
 *
 * Edit: clicking Edit expands the row inline with form fields. Save
 * PUTs to /api/admin/communities/:id.
 *
 * Archive: trash icon → confirm modal → DELETE
 * /api/admin/communities/:id which TOGGLES status between 'active' and
 * 'deactivated'. Historical round data stays linked (snapshots
 * preserve community_id at round time).
 */
export default function Communities() {
  const [communities, setCommunities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [latestCohorts, setLatestCohorts] = useState([]);
  const [previousCohorts, setPreviousCohorts] = useState([]);
  const [issues, setIssues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortKey, setSortKey] = useState("nps");
  const [editingId, setEditingId] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState("active");
  // CSV import — 2-step flow on the server side. POST
  // /api/admin/communities/import/preview returns parsed rows + a
  // per-row diff of what would change (no DB writes). The user reviews,
  // then POST /api/admin/communities/import commits with the same file.
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const importInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, rRes, lRes] = await Promise.all([
        fetch("/api/admin/communities", { credentials: "include" }),
        fetch("/api/admin/survey-rounds", { credentials: "include" }),
        fetch("/api/admin/locations", { credentials: "include" }),
      ]);
      if (!cRes.ok) throw new Error("Failed to load communities");
      const cs = await cRes.json();
      setCommunities(cs);
      if (lRes.ok) setLocations(await lRes.json());

      // Merge in NPS data + warnings from the two most-recent concluded
      // rounds. Quietly skips if there's no round data yet — the table
      // still renders with blank metrics columns.
      if (rRes.ok) {
        const list = await rRes.json();
        const concluded = list
          .filter((r) => r.status === "concluded")
          .sort((a, b) => b.round_number - a.round_number);
        if (concluded.length > 0) {
          const latest = await fetchDashboard(concluded[0].id);
          setLatestCohorts(latest?.community_cohorts || []);

          // Issues come from latest round's alerts grouped by community.
          const issuesMap = {};
          for (const a of latest?.alerts || []) {
            const cn = a.alert_community;
            if (!cn || a.dismissed || a.solved) continue;
            // First active alert per community wins as the displayed issue.
            if (!issuesMap[cn]) issuesMap[cn] = a.alert_type || a.description || "";
          }
          setIssues(issuesMap);
        }
        if (concluded.length > 1) {
          const prev = await fetchDashboard(concluded[1].id);
          setPreviousCohorts(prev?.community_cohorts || []);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      const res = await fetch(`/api/admin/communities/${archiveTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to archive");
      setArchiveTarget(null);
      await load();
    } catch (err) {
      alert(err.message);
      setArchiveTarget(null);
    }
  };

  // Reactivate hits the same toggle endpoint as archive, but without
  // the confirm modal — bringing a community back into rotation is
  // low-risk and the user already explicitly clicked "Reactivate".
  const handleReactivate = async (id) => {
    try {
      const res = await fetch(`/api/admin/communities/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reactivate");
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveEdit = async (id, patch) => {
    try {
      const res = await fetch(`/api/admin/communities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
      }
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreate = async (patch) => {
    try {
      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add");
      }
      setAddOpen(false);
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  // CSV import — POST /preview first to get the parsed rows + diff,
  // then the modal lets the admin review and confirm. Confirm POSTs
  // the same file to /import which commits the writes.
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportPreview(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/communities/import/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setImportPreview(data);
      setImportFile(file);
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/admin/communities/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportResult(data);
      setImportPreview(null);
      setImportFile(null);
      await load();
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleImportCancel = () => {
    setImportPreview(null);
    setImportFile(null);
  };

  if (loading) {
    return (
      <p
        className="text-center py-10"
        style={{ color: "var(--ink-4)" }}
        data-testid="communities-loading"
      >
        Loading…
      </p>
    );
  }
  if (error) {
    return <p className="text-center py-10 text-red-500">{error}</p>;
  }

  // 'active' shows the working roster; 'archived' shows deactivated
  // communities (still in the DB for historical reporting). Both are
  // returned by GET /communities — we just filter client-side.
  const active = communities.filter((c) =>
    view === "archived" ? c.status === "deactivated" : c.status !== "deactivated"
  );

  // Build per-community metrics by name match against the cohorts.
  const cohortByName = mapByName(latestCohorts);
  const prevCohortByName = mapByName(previousCohorts);

  const enriched = active.map((c) => {
    const latest = cohortByName.get(c.community_name);
    const prev = prevCohortByName.get(c.community_name);
    const nps = latest?.nps != null ? latest.nps : medianToNps(latest?.median);
    const prevNps = prev?.nps != null ? prev.nps : medianToNps(prev?.median);
    return {
      ...c,
      nps,
      prev_nps: prevNps,
      delta_nps: nps != null && prevNps != null ? nps - prevNps : null,
      // `cohort` (promoter/passive/detractor) is the source of truth for
      // the at-risk roll-up below — must match Round Results + Home,
      // both of which use cohort === 'detractor'. The per-row 🔥 tone
      // can stay nps-based since the spec calls for an NPS threshold
      // visual; the financial metric must be cohort-based.
      cohort: latest?.cohort || null,
      detractors: latest?.detractors ?? null,
      passives: latest?.passives ?? null,
      promoters: latest?.promoters ?? null,
      issue: issues[c.community_name] || null,
    };
  });

  const regions = Array.from(new Set(enriched.map((c) => c.location_name).filter(Boolean)));
  const managers = Array.from(
    new Set(enriched.map((c) => c.community_manager_name).filter(Boolean))
  );
  const types = Array.from(new Set(enriched.map((c) => c.property_type).filter(Boolean)));

  const filtered = enriched.filter((c) => {
    if (regionFilter && c.location_name !== regionFilter) return false;
    if (managerFilter && c.community_manager_name !== managerFilter) return false;
    if (typeFilter && c.property_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.community_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ARR roll-up: total contract value across the active roster, plus the
  // share concentrated in at-risk (detractor cohort) communities.
  // MUST match the at-risk definition used by Round Results and Home —
  // both pull from `community_analytics.revenue_at_risk` which is built
  // server-side from `cohort === 'detractor' && contract_value`. Using
  // an NPS threshold here drifted from that definition and caused the
  // header rollup to over-count.
  const totalArr = enriched.reduce((sum, c) => sum + (Number(c.contract_value) || 0), 0);
  const atRisk = enriched.filter((c) => c.cohort === "detractor" && Number(c.contract_value) > 0);
  const atRiskArr = atRisk.reduce((sum, c) => sum + (Number(c.contract_value) || 0), 0);

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "nps") {
      // Risk-first: lowest NPS first; nulls go to the end.
      const av = a.nps == null ? 999 : a.nps;
      const bv = b.nps == null ? 999 : b.nps;
      return av - bv;
    }
    if (sortKey === "arr") {
      const av = Number(a.contract_value) || 0;
      const bv = Number(b.contract_value) || 0;
      return bv - av;
    }
    return (a.community_name || "").localeCompare(b.community_name || "");
  });

  return (
    <div className="space-y-3.5" data-testid="communities">
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
            Communities
          </h1>
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
            {view === "archived" ? (
              `${active.length} archived. Reactivate to bring back into the active roster.`
            ) : (
              <>
                <span>{active.length} communities</span>
                {totalArr > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--ink-2)" }}>
                      <strong>{formatMoney(totalArr)}</strong> total ARR
                    </span>
                  </>
                )}
                {atRisk.length > 0 && atRiskArr > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--coral)", fontWeight: 600 }}>
                      {formatMoney(atRiskArr)} at risk
                    </span>
                    <span style={{ color: "var(--ink-4)" }}>
                      {" "}
                      across {atRisk.length} {atRisk.length === 1 ? "community" : "communities"}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <a
            href="/api/admin/communities/export"
            className="btn-ghost"
            style={{ textDecoration: "none" }}
          >
            Export CSV
          </a>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="btn-ghost"
            type="button"
          >
            {importing ? "Uploading…" : "Import"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            className="hidden"
            aria-hidden="true"
          />
          <button onClick={() => setAddOpen(true)} className="btn-pulse" type="button">
            + Add community
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl bg-white overflow-hidden"
        style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
      >
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search communities…" />
          <FilterSelect
            label="Region"
            value={regionFilter}
            onChange={setRegionFilter}
            options={regions.map((r) => ({ value: r, label: r }))}
          />
          <FilterSelect
            label="Manager"
            value={managerFilter}
            onChange={setManagerFilter}
            options={managers.map((m) => ({ value: m, label: m }))}
          />
          <FilterSelect
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={types.map((t) => ({ value: t, label: formatPropertyType(t) }))}
          />
          <div style={{ marginLeft: "auto" }}>
            <FilterSelect
              label="Sort"
              value={sortKey}
              onChange={setSortKey}
              options={[
                { value: "nps", label: "NPS (risk first)" },
                { value: "arr", label: "ARR (highest first)" },
                { value: "name", label: "Name (A–Z)" },
              ]}
            />
          </div>
        </div>

        <CommunityTableHeader />

        <div>
          {sorted.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-center" style={{ color: "var(--ink-4)" }}>
              No communities match these filters.
            </p>
          ) : (
            sorted.map((c, i) => (
              <CommunityRow
                key={c.id}
                community={c}
                locations={locations}
                view={view}
                isLast={i === sorted.length - 1}
                isEditing={editingId === c.id}
                onStartEdit={() => setEditingId(c.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(patch) => handleSaveEdit(c.id, patch)}
                onArchive={() => setArchiveTarget(c)}
                onReactivate={() => handleReactivate(c.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Add community modal */}
      {addOpen && (
        <CommunityModal
          locations={locations}
          onCancel={() => setAddOpen(false)}
          onSave={handleCreate}
        />
      )}

      {/* Archive confirm */}
      {archiveTarget && (
        <ArchiveModal
          name={archiveTarget.community_name}
          subjectKind="community"
          onCancel={() => setArchiveTarget(null)}
          onConfirm={handleArchive}
        />
      )}

      {/* CSV import preview (step 1) — shows parsed rows + per-row diff
            so the admin can review what will change before committing. */}
      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          busy={importing}
          onCancel={handleImportCancel}
          onConfirm={handleImportConfirm}
        />
      )}

      {/* CSV import result (step 2 / error) */}
      {importResult && (
        <ImportResultModal
          result={importResult}
          subject="community"
          sampleHint="community_name, manager, region/location, property_type"
          onClose={() => setImportResult(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function CommunityTableHeader() {
  return (
    <div
      className="grid items-center gap-3 px-5 py-3 text-[10.5px] font-bold uppercase"
      style={{
        gridTemplateColumns: "32px 2fr 1.4fr 1.2fr 0.7fr 0.9fr 1.4fr auto",
        letterSpacing: "0.06em",
        color: "var(--ink-4)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span />
      <span>Community</span>
      <span>Manager / Region</span>
      <span>NPS sentiment</span>
      <span style={{ textAlign: "right" }}>NPS</span>
      <span style={{ textAlign: "right" }}>ARR</span>
      <span>Issue</span>
      <span style={{ width: 110, textAlign: "right" }} />
    </div>
  );
}

function CommunityRow({
  community,
  locations,
  view,
  isLast,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onArchive,
  onReactivate,
}) {
  if (isEditing) {
    return (
      <CommunityEditRow
        community={community}
        locations={locations}
        isLast={isLast}
        onCancel={onCancelEdit}
        onSave={onSave}
      />
    );
  }

  const c = community;
  // Tone drives the 🔥 indicator + coral row tint + ARR coral-tint.
  // Prefer cohort (matches Round Results + Home), fall back to NPS
  // thresholds when a cohort entry isn't available.
  const tone =
    c.cohort === "detractor"
      ? "risk"
      : c.cohort === "promoter"
        ? "good"
        : c.cohort === "passive"
          ? "mid"
          : c.nps == null
            ? "neutral"
            : c.nps <= -10
              ? "risk"
              : c.nps >= 25
                ? "good"
                : "mid";
  const rowBg = tone === "risk" ? "var(--coral-tint)" : "transparent";
  const npsColor =
    tone === "risk" ? "var(--coral)" : tone === "good" ? "var(--pulse-deep)" : "var(--ink)";
  const arrValue = Number(c.contract_value) || 0;
  const arrColor =
    arrValue <= 0 ? "var(--ink-4)" : tone === "risk" ? "var(--coral)" : "var(--ink-2)";

  return (
    <div
      className="grid items-center gap-3 px-5 py-3 transition"
      style={{
        gridTemplateColumns: "32px 2fr 1.4fr 1.2fr 0.7fr 0.9fr 1.4fr auto",
        backgroundColor: rowBg,
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
      onMouseEnter={(e) => {
        if (tone !== "risk") e.currentTarget.style.backgroundColor = "var(--paper-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = rowBg;
      }}
    >
      <span
        style={{ color: tone === "risk" ? "var(--coral)" : "var(--pulse)", textAlign: "center" }}
      >
        {tone === "risk" ? "🔥" : tone === "good" ? "🌱" : ""}
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-[13.5px] truncate" style={{ color: "var(--ink)" }}>
          {c.community_name}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {[formatPropertyType(c.property_type), `${c.member_count || 0} board members`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium truncate" style={{ color: "var(--ink-2)" }}>
          {c.community_manager_name || "Unassigned"}
        </div>
        <div className="text-[11.5px] truncate" style={{ color: "var(--ink-3)" }}>
          {c.location_name || "—"}
        </div>
      </div>
      <SentimentBar d={c.detractors} p={c.passives} pr={c.promoters} />
      <span
        className="font-mono font-bold"
        style={{ textAlign: "right", color: npsColor, fontSize: 13 }}
      >
        {c.nps != null ? formatNps(c.nps) : "—"}
      </span>
      <span
        className="font-mono font-semibold"
        style={{
          textAlign: "right",
          color: arrColor,
          fontSize: 12.5,
          fontWeight: arrValue > 0 ? 700 : 500,
        }}
        title={arrValue > 0 ? `Contract value: $${arrValue.toLocaleString()}` : "Set in Edit ↗"}
      >
        {arrValue > 0 ? formatMoney(arrValue) : "—"}
      </span>
      <span
        className="text-[12px] truncate"
        style={{ color: "var(--ink-3)" }}
        title={c.issue ? formatAlertLabel(c.issue) : ""}
      >
        {c.issue ? formatAlertLabel(c.issue) : "—"}
      </span>
      <div className="flex items-center gap-1.5" style={{ width: 110, justifyContent: "flex-end" }}>
        {view === "archived" ? (
          // The community DELETE endpoint toggles status — calling it
          // again on a deactivated community reactivates it. Direct
          // call (no confirm modal) since reactivation is low-risk.
          <button onClick={onReactivate} className="btn-pulse-sm" type="button">
            Reactivate
          </button>
        ) : (
          <>
            <button onClick={onStartEdit} className="btn-ghost-sm" type="button">
              Edit
            </button>
            <ArchiveIconButton onClick={onArchive} title="Archive community" />
          </>
        )}
      </div>
    </div>
  );
}

function CommunityEditRow({ community, locations, isLast, onCancel, onSave }) {
  const [name, setName] = useState(community.community_name || "");
  const [manager, setManager] = useState(community.community_manager_name || "");
  const [type, setType] = useState(community.property_type || "");
  const [units, setUnits] = useState(community.number_of_units || "");
  const [contractValue, setContractValue] = useState(community.contract_value || "");
  const [locationId, setLocationId] = useState(community.location_id || "");
  const [renewalDate, setRenewalDate] = useState(
    community.contract_renewal_date ? community.contract_renewal_date.slice(0, 10) : ""
  );
  const [monthToMonth, setMonthToMonth] = useState(!!community.contract_month_to_month);

  return (
    <div
      className="px-5 py-4 space-y-3"
      style={{
        backgroundColor: "var(--paper-2)",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      {/* Row 1: identity */}
      <div
        className="grid gap-3 items-end"
        style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1.2fr" }}
      >
        <FieldInput label="Community name" value={name} onChange={setName} />
        <FieldInput label="Manager" value={manager} onChange={setManager} />
        <PropertyTypeSelect value={type} onChange={setType} />
        <LocationSelect locations={locations} value={locationId} onChange={setLocationId} />
      </div>
      {/* Row 2: contract details + Save/Cancel */}
      <div
        className="grid gap-3 items-end"
        style={{ gridTemplateColumns: "0.7fr 0.9fr 1.1fr auto auto" }}
      >
        <FieldInput label="Units" value={units} onChange={setUnits} type="number" />
        <FieldInput
          label="Contract $"
          value={contractValue}
          onChange={setContractValue}
          type="number"
        />
        <FieldInput
          label="Renewal date"
          value={renewalDate}
          onChange={setRenewalDate}
          type="date"
        />
        <CheckboxField label="Month-to-month" checked={monthToMonth} onChange={setMonthToMonth} />
        <div className="flex gap-1.5">
          <button
            onClick={() =>
              onSave({
                community_name: name.trim(),
                community_manager_name: manager.trim() || null,
                property_type: type || null,
                number_of_units: units ? Number(units) : null,
                contract_value: contractValue ? Number(contractValue) : null,
                location_id: locationId ? Number(locationId) : null,
                // If month-to-month is set, the renewal-date date doesn't
                // apply — null it out to keep the data clean.
                contract_renewal_date: monthToMonth ? null : renewalDate || null,
                contract_month_to_month: monthToMonth,
              })
            }
            className="btn-pulse-sm"
            type="button"
          >
            Save
          </button>
          <button onClick={onCancel} className="btn-ghost-sm" type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CommunityModal({ locations, onCancel, onSave }) {
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [type, setType] = useState("");
  const [units, setUnits] = useState("");
  const [locationId, setLocationId] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [monthToMonth, setMonthToMonth] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3
          className="font-semibold mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}
        >
          Add community
        </h3>
        <FieldInput label="Community name" value={name} onChange={setName} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Manager" value={manager} onChange={setManager} />
          <LocationSelect locations={locations} value={locationId} onChange={setLocationId} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <PropertyTypeSelect value={type} onChange={setType} />
          <FieldInput label="Units" value={units} onChange={setUnits} type="number" />
          <FieldInput
            label="Contract $"
            value={contractValue}
            onChange={setContractValue}
            type="number"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <FieldInput
            label="Renewal date"
            value={renewalDate}
            onChange={setRenewalDate}
            type="date"
          />
          <CheckboxField label="Month-to-month" checked={monthToMonth} onChange={setMonthToMonth} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="btn-ghost" type="button">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim()) {
                alert("Community name is required.");
                return;
              }
              onSave({
                community_name: name.trim(),
                community_manager_name: manager.trim() || null,
                property_type: type || null,
                number_of_units: units ? Number(units) : null,
                contract_value: contractValue ? Number(contractValue) : null,
                location_id: locationId ? Number(locationId) : null,
                contract_renewal_date: monthToMonth ? null : renewalDate || null,
                contract_month_to_month: monthToMonth,
              });
            }}
            className="btn-pulse"
            type="button"
          >
            Add community
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Location dropdown — pulls from /api/admin/locations. The
 * locations table is the canonical source for office/region; the
 * legacy management_company text on users gets canonicalized into
 * locations via autoCreateLocationIfNeeded on save. New locations
 * are created via POST /api/admin/locations (out of scope for this
 * view; users type a free-text option for now and it auto-creates
 * elsewhere).
 */
function LocationSelect({ locations, value, onChange }) {
  return (
    <div className="mb-3">
      <label
        className="block text-[10.5px] font-semibold uppercase mb-1"
        style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        Location / Office
      </label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-lg outline-none"
        style={{ border: "1px solid var(--line-2)", color: "var(--ink)" }}
      >
        <option value="">— Unassigned —</option>
        {(locations || []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Boolean checkbox styled to match the rest of the form fields.
 * Used here for "Month-to-month" — when checked, contract_renewal_date
 * is cleared on save so we don't persist a stale date alongside an
 * indefinite-renewal flag.
 */
function CheckboxField({ label, checked, onChange }) {
  return (
    <div className="mb-3">
      <label
        className="flex items-center gap-2 px-3 py-2 text-[13px] rounded-lg cursor-pointer"
        style={{
          border: "1px solid var(--line-2)",
          color: "var(--ink-2)",
          backgroundColor: "white",
        }}
      >
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: "var(--pulse)" }}
        />
        {label}
      </label>
    </div>
  );
}

function PropertyTypeSelect({ value, onChange }) {
  return (
    <div className="mb-3">
      <label
        className="block text-[10.5px] font-semibold uppercase mb-1"
        style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        Type
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-lg outline-none"
        style={{ border: "1px solid var(--line-2)", color: "var(--ink)" }}
      >
        <option value="">—</option>
        <option value="condo">Condo</option>
        <option value="townhome">Townhome</option>
        <option value="single_family">Single Family</option>
        <option value="mixed">Mixed</option>
        <option value="other">Other</option>
      </select>
    </div>
  );
}

function SentimentBar({ d, p, pr }) {
  const total = (d || 0) + (p || 0) + (pr || 0);
  if (total === 0) {
    return (
      <div
        style={{
          height: 8,
          width: 120,
          borderRadius: 999,
          backgroundColor: "var(--paper-3)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 120,
        height: 8,
        display: "flex",
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: "var(--paper-3)",
      }}
    >
      <div style={{ width: `${(d / total) * 100}%`, backgroundColor: "var(--coral)" }} />
      <div style={{ width: `${(p / total) * 100}%`, backgroundColor: "var(--amber)" }} />
      <div style={{ width: `${(pr / total) * 100}%`, backgroundColor: "var(--pulse)" }} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

async function fetchDashboard(roundId) {
  try {
    const res = await fetch(`/api/admin/survey-rounds/${roundId}/dashboard`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function mapByName(cohorts) {
  const m = new Map();
  for (const c of cohorts || []) {
    const key = (c.name || c.community_name || "").trim().toLowerCase();
    if (key) m.set(c.name || c.community_name, c);
  }
  // Also key by lowercase for tolerant matching.
  return {
    get(name) {
      if (!name) return null;
      return m.get(name) || m.get(name.trim()) || null;
    },
  };
}

function medianToNps(median) {
  // Cohort entries sometimes carry only a 0–10 median rather than an
  // NPS-style score. Convert to a rough NPS equivalent so the row can
  // still show a number.
  if (median == null) return null;
  return Math.round((median - 5) * 20);
}

function formatNps(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatPropertyType(t) {
  if (!t) return "";
  return (
    {
      condo: "Condo",
      townhome: "Townhome",
      single_family: "Single Family",
      mixed: "Mixed",
      other: "Other",
    }[t] || t
  );
}

// Friendly labels for the alert_type enum from the critical_alerts table.
// Mirrors the labels used in emailService.js so the UI and emails stay
// in sync — if more alert types are added there, mirror them here.
function formatAlertLabel(type) {
  if (!type) return "";
  const labels = {
    contract_termination: "Contract termination",
    legal_threat: "Legal threat",
    safety_concern: "Safety concern",
    other_critical: "Critical concern",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// Compact ARR/contract value formatter. Uses K/M suffixes once values
// get large enough to need them so the row sub-text doesn't blow up.
function formatMoney(n) {
  const num = Number(n);
  if (!num || num <= 0) return "";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`;
  if (num >= 10_000) return `$${Math.round(num / 1000)}K`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

// ──────────────────────────────────────────────────────────────────────
// CSV import preview modal
// ──────────────────────────────────────────────────────────────────────

/**
 * ImportPreviewModal — review step before committing the CSV import.
 *
 * Server returns { matched, unmatched, errors }:
 *   matched[]    — rows whose community_name matches an existing one
 *                  (will UPDATE the row, member_count shown for
 *                  context)
 *   unmatched[]  — rows with no exact name match (will INSERT a new
 *                  community; suggestions[] surface fuzzy matches in
 *                  case it's a typo of an existing name)
 *   errors[]     — CSV parse errors (bad columns, invalid types, etc.)
 *
 * Confirm POSTs the same file to /communities/import which commits.
 */
function ImportPreviewModal({ preview, busy, onCancel, onConfirm }) {
  const matched = preview.matched || [];
  const unmatched = preview.unmatched || [];
  const errors = preview.errors || [];
  const totalChanges = matched.length + unmatched.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(36,42,52,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: "100%",
          padding: 24,
          boxShadow: "var(--shadow-lg)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
            marginBottom: 4,
          }}
        >
          Review CSV import
        </h3>
        <p className="text-[13px]" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
          {totalChanges} row{totalChanges === 1 ? "" : "s"} ready to import.
          {matched.length > 0 && (
            <>
              {" "}
              <strong style={{ color: "var(--ink)" }}>{matched.length}</strong> will update existing
              communities;
            </>
          )}
          {unmatched.length > 0 && (
            <>
              {" "}
              <strong style={{ color: "var(--ink)" }}>{unmatched.length}</strong> will be added as
              new communities.
            </>
          )}
        </p>

        <div style={{ overflowY: "auto", flex: 1, marginBottom: 16 }}>
          {matched.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                className="text-[10.5px] font-bold uppercase mb-2"
                style={{ letterSpacing: "0.08em", color: "var(--pulse-deep)" }}
              >
                Will update ({matched.length})
              </div>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--line)" }}
              >
                {matched.slice(0, 30).map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[12.5px]"
                    style={{
                      padding: "8px 12px",
                      borderBottom:
                        i === Math.min(matched.length, 30) - 1 ? "none" : "1px solid var(--line)",
                    }}
                  >
                    <span style={{ color: "var(--ink)" }}>{row.matched_name}</span>
                    <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                      {row.member_count} member{row.member_count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
                {matched.length > 30 && (
                  <div
                    className="text-[11.5px] italic text-center"
                    style={{ padding: 8, color: "var(--ink-4)" }}
                  >
                    …and {matched.length - 30} more.
                  </div>
                )}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                className="text-[10.5px] font-bold uppercase mb-2"
                style={{ letterSpacing: "0.08em", color: "var(--amber)" }}
              >
                Will add as new ({unmatched.length})
              </div>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--line)" }}
              >
                {unmatched.slice(0, 30).map((row, i) => (
                  <div
                    key={i}
                    className="text-[12.5px]"
                    style={{
                      padding: "8px 12px",
                      borderBottom:
                        i === Math.min(unmatched.length, 30) - 1 ? "none" : "1px solid var(--line)",
                    }}
                  >
                    <div style={{ color: "var(--ink)" }}>{row.community_name}</div>
                    {row.suggestions?.length > 0 && (
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-4)" }}>
                        Did you mean: {row.suggestions.map((s) => s.name).join(", ")}?
                      </div>
                    )}
                  </div>
                ))}
                {unmatched.length > 30 && (
                  <div
                    className="text-[11.5px] italic text-center"
                    style={{ padding: 8, color: "var(--ink-4)" }}
                  >
                    …and {unmatched.length - 30} more.
                  </div>
                )}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div>
              <div
                className="text-[10.5px] font-bold uppercase mb-2"
                style={{ letterSpacing: "0.08em", color: "var(--coral)" }}
              >
                Skipped — CSV errors ({errors.length})
              </div>
              <div
                className="rounded-lg"
                style={{
                  backgroundColor: "var(--coral-tint)",
                  border: "1px solid rgba(232,93,76,0.3)",
                  padding: 10,
                  maxHeight: 120,
                  overflowY: "auto",
                }}
              >
                <ul
                  className="text-[12px]"
                  style={{ color: "var(--coral)", listStyle: "none", paddingLeft: 0, margin: 0 }}
                >
                  {errors.slice(0, 20).map((e, i) => (
                    <li key={i} className="font-mono" style={{ marginBottom: 4 }}>
                      {typeof e === "string" ? e : (e?.message ?? JSON.stringify(e))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2" style={{ flexShrink: 0 }}>
          <button onClick={onCancel} disabled={busy} className="btn-ghost" type="button">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || totalChanges === 0}
            className="btn-pulse"
            type="button"
          >
            {busy ? "Importing…" : `Confirm import (${totalChanges})`}
          </button>
        </div>
      </div>
    </div>
  );
}
