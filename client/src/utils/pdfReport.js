/**
 * pdfReport — shared helpers for the v2 PDF export reports on
 * /admin/rounds/:id (round results) and /admin/trends.
 *
 * Both reports render in a popped-open window using a v2-styled
 * standalone HTML document, so users can hit "Print / Save as PDF"
 * with a layout that matches the on-screen aesthetic. The shared
 * helpers below cover:
 *
 *   • V2_PALETTE       — hex equivalents of the design tokens (the
 *                        printable HTML can't use CSS custom props
 *                        because Chrome's print view sometimes drops
 *                        them; hex is universally safe).
 *   • baseStyles       — CSS reset + typography + layout primitives
 *                        the templates can drop straight into <head>.
 *   • header / footer  — top brand bar + bottom credit strip.
 *   • SVG generators   — pure functions returning SVG strings:
 *                          npsLineSvg, stackedSentimentSvg,
 *                          horizontalBarsSvg, percentBarsSvg.
 *   • renderTable      — generic v2-styled <table> from rows + cols.
 *
 * Anything PDF-specific that needs to know the screen state (filters,
 * dashboard data) stays in the calling component — these helpers are
 * pure and have no React/DOM dependencies beyond the eventual write.
 */

export const V2_PALETTE = {
  ink: "#242a34",
  ink2: "#3b424d",
  ink3: "#5b626d",
  ink4: "#8a909a",
  ink5: "#b8bdc4",
  paper: "#fbfaf6",
  paper2: "#f4f1ea",
  paper3: "#ebe7dd",
  line: "#e6e1d4",
  line2: "#d3cdbd",
  pulse: "#1FA571",
  pulseDeep: "#147a52",
  pulseTint: "#dff3ea",
  coral: "#e85d4c",
  coralTint: "#fbe3df",
  amber: "#f8a854",
  amberTint: "#fdecd8",
  plum: "#7e4c8a",
  plumTint: "#efe4f1",
};

const C = V2_PALETTE;

/**
 * Base stylesheet — drop into <head><style>{baseStyles()}</style></head>.
 * Loads Inter + Fraunces from Google Fonts so the printable matches
 * the in-app type system; falls back to system stack if offline.
 */
export function baseStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: ${C.paper}; color: ${C.ink}; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      letter-spacing: -0.005em;
      max-width: 820px;
      margin: 0 auto;
      padding: 32px 32px 56px;
    }

    h1, h2, h3, .display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; font-weight: 500; color: ${C.ink}; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    h2 { font-size: 20px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid ${C.line}; }
    h3 { font-size: 16px; margin: 18px 0 6px; }

    p { margin: 0 0 8px; color: ${C.ink2}; }
    .muted { color: ${C.ink3}; }
    .micro { font-size: 11px; color: ${C.ink4}; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace; }
    .uppercase-eyebrow { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: ${C.ink4}; }

    .card {
      background: white;
      border: 1px solid ${C.line};
      border-radius: 14px;
      padding: 18px 20px;
      margin: 14px 0;
    }
    .card.ink {
      background: linear-gradient(135deg, ${C.ink}, ${C.ink2});
      color: white;
      border: none;
    }
    .card.ink p { color: ${C.ink5}; }

    .row { display: flex; gap: 14px; }
    .row > * { flex: 1; }
    .row.tight { gap: 10px; }

    .stat {
      display: inline-flex; align-items: baseline; gap: 6px;
    }
    .stat .v {
      font-family: 'Fraunces', Georgia, serif; font-weight: 500;
      font-size: 38px; line-height: 1; letter-spacing: -0.025em;
    }
    .stat .u { color: ${C.ink3}; font-size: 14px; }

    .pill {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .pill.good { background: ${C.pulseTint}; color: ${C.pulseDeep}; }
    .pill.warn { background: ${C.coralTint}; color: ${C.coral}; }
    .pill.amber { background: ${C.amberTint}; color: #8C5E1F; }
    .pill.neutral { background: ${C.paper3}; color: ${C.ink3}; }

    table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
    th {
      text-align: left; font-size: 10.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: ${C.ink4}; padding: 8px 10px;
      border-bottom: 1px solid ${C.line};
      background: ${C.paper2};
    }
    td {
      padding: 8px 10px; font-size: 13px; color: ${C.ink2};
      border-bottom: 1px solid ${C.line};
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .center { text-align: center; }
    .num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; }

    .brand-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding-bottom: 18px; margin-bottom: 18px;
      border-bottom: 1px solid ${C.line};
    }
    .brand-bar .left { display: flex; align-items: center; gap: 14px; }
    .brand-bar .logo {
      height: 38px; max-width: 160px; object-fit: contain;
      background: white; border: 1px solid ${C.line}; border-radius: 6px; padding: 4px;
    }
    .brand-bar .logo-fallback {
      width: 38px; height: 38px; border-radius: 8px; display: flex;
      align-items: center; justify-content: center;
      background: linear-gradient(135deg, ${C.pulse}, ${C.pulseDeep});
      color: white;
    }
    .brand-bar .meta .uppercase-eyebrow { color: ${C.pulseDeep}; }

    .footer {
      margin-top: 40px; padding-top: 12px;
      border-top: 1px solid ${C.line};
      display: flex; justify-content: space-between; gap: 12px;
      font-size: 10.5px; color: ${C.ink4};
    }

    .toolbar {
      display: flex; gap: 8px; margin-bottom: 16px;
    }
    .toolbar button {
      font-family: inherit; font-size: 13px; font-weight: 600;
      padding: 8px 16px; border-radius: 10px; cursor: pointer;
      border: 1px solid ${C.line2}; background: white; color: ${C.ink2};
    }
    .toolbar button.primary {
      background: ${C.ink}; color: white; border-color: ${C.ink};
    }

    @media print {
      body { padding: 24px; max-width: none; background: white; }
      .toolbar { display: none !important; }
      .card { break-inside: avoid; }
      table, h2, h3 { break-inside: avoid; }
    }
  `;
}

/**
 * Brand header — logo (per-tenant) + report title eyebrow + h1.
 */
export function brandBar({ companyName, logoUrl, eyebrow, title, subtitle }) {
  const logoMarkup = logoUrl
    ? `<img class="logo" src="${logoUrl}" alt="${escapeHtml(companyName || "Logo")}"
         onerror="this.outerHTML='<div class=\\'logo-fallback\\'><svg width=\\'18\\' height=\\'18\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'white\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M3 12h4l2-7 4 14 2-7h6\\'/></svg></div>'" />`
    : `<div class="logo-fallback"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg></div>`;
  return `
    <div class="brand-bar">
      <div class="left">
        ${logoMarkup}
        <div class="meta">
          <div class="uppercase-eyebrow">${escapeHtml(eyebrow || "ResidentPulse Report")}</div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="muted" style="margin-top:2px;">${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </div>
      <div class="micro" style="text-align:right;">
        Generated ${escapeHtml(formatLongDate(new Date()))}<br/>
        ${escapeHtml(companyName || "")}
      </div>
    </div>`;
}

export function toolbar() {
  return `
    <div class="toolbar">
      <button class="primary" onclick="window.print()">Print / Save as PDF</button>
      <button onclick="window.close()">Close</button>
    </div>`;
}

export function footer() {
  return `
    <div class="footer">
      <span>Powered by ResidentPulse · CAM Ascent</span>
      <span class="mono">${escapeHtml(formatLongDate(new Date()))}</span>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────
// SVG chart generators — pure strings, embedded inline in the printout.
// ──────────────────────────────────────────────────────────────────────

/**
 * NPS line chart — mirrors NpsLineChart from charts/NpsCharts.jsx but
 * returns a string so it can drop into the printable HTML.
 *
 * Expects `data` as an array of { round: string, nps: number }.
 */
export function npsLineSvg(data, { width = 720, height = 220 } = {}) {
  if (!data || data.length === 0) return "";
  const pad = { top: 24, right: 30, bottom: 30, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const yMin = -100;
  const yMax = 100;
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const yToPx = (y) => pad.top + h - ((y - yMin) / (yMax - yMin)) * h;
  const points = data.map((d, i) => [pad.left + i * stepX, yToPx(d.nps)]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const gridY = [-50, 0, 50];

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}"
         preserveAspectRatio="xMidYMid meet"
         style="display:block;max-width:100%;height:auto;">
      <rect x="${pad.left}" y="${yToPx(0)}" width="${w}" height="${pad.top + h - yToPx(0)}" fill="${C.coralTint}" opacity="0.4"/>
      <rect x="${pad.left}" y="${pad.top}" width="${w}" height="${yToPx(0) - pad.top}" fill="${C.pulseTint}" opacity="0.5"/>
      ${gridY
        .map(
          (g) => `
        <line x1="${pad.left}" x2="${pad.left + w}" y1="${yToPx(g)}" y2="${yToPx(g)}"
              stroke="${C.line}" stroke-width="1" stroke-dasharray="${g === 0 ? "0" : "2 3"}"/>
        <text x="${pad.left - 8}" y="${yToPx(g) + 3}" text-anchor="end" font-size="10" fill="${C.ink4}" font-family="JetBrains Mono, monospace">${g}</text>
      `
        )
        .join("")}
      <path d="${path}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${points
        .map(
          (p, i) => `
        <circle cx="${p[0]}" cy="${p[1]}" r="4" fill="white" stroke="${C.ink}" stroke-width="2"/>
        <text x="${p[0]}" y="${p[1] - 12}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.ink}">${data[i].nps > 0 ? "+" : ""}${data[i].nps}</text>
        <text x="${p[0]}" y="${pad.top + h + 18}" text-anchor="middle" font-size="11" fill="${C.ink3}" font-family="JetBrains Mono, monospace">${escapeHtml(data[i].round)}</text>
      `
        )
        .join("")}
    </svg>`;
}

/**
 * Stacked sentiment bars — Detractor / Passive / Promoter share per
 * round, normalized to 100% of each round's total respondents.
 *
 * Expects `data` as { round, detractors, passives, promoters }.
 */
export function stackedSentimentSvg(data, { width = 720, height = 220 } = {}) {
  if (!data || data.length === 0) return "";
  const pad = { top: 12, right: 20, bottom: 26, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const barW = (w / data.length) * 0.55;
  const gap = w / data.length - barW;

  const barHtml = data
    .map((d, i) => {
      const total = (d.detractors || 0) + (d.passives || 0) + (d.promoters || 0);
      if (total === 0) return "";
      const cx = pad.left + i * (barW + gap) + gap / 2;
      const detH = ((d.detractors || 0) / total) * h;
      const passH = ((d.passives || 0) / total) * h;
      const promH = ((d.promoters || 0) / total) * h;
      let y = pad.top;
      const promoY = y;
      y += promH;
      const passY = y;
      y += passH;
      const detY = y;
      return `
        <rect x="${cx}" y="${promoY}" width="${barW}" height="${promH}" fill="${C.pulse}" rx="3"/>
        <rect x="${cx}" y="${passY}" width="${barW}" height="${passH}" fill="${C.amber}"/>
        <rect x="${cx}" y="${detY}" width="${barW}" height="${detH}" fill="${C.coral}" rx="3" ry="3"/>
        <text x="${cx + barW / 2}" y="${pad.top + h + 18}" text-anchor="middle" font-size="11" fill="${C.ink3}" font-family="JetBrains Mono, monospace">R${d.round}</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}"
         preserveAspectRatio="xMidYMid meet"
         style="display:block;max-width:100%;height:auto;">
      ${[0, 25, 50, 75, 100]
        .map(
          (g) => `
        <line x1="${pad.left}" x2="${pad.left + w}" y1="${pad.top + h - (g / 100) * h}" y2="${pad.top + h - (g / 100) * h}"
              stroke="${C.line}" stroke-width="1" stroke-dasharray="${g === 0 ? "0" : "2 3"}"/>
        <text x="${pad.left - 8}" y="${pad.top + h - (g / 100) * h + 3}" text-anchor="end" font-size="10" fill="${C.ink4}" font-family="JetBrains Mono, monospace">${g}%</text>
      `
        )
        .join("")}
      ${barHtml}
    </svg>`;
}

/**
 * Revenue at risk over time — single-color bars with a 20% watch line.
 * Expects `data` as { round: number, percent: number }.
 */
export function revenueRiskSvg(data, { width = 720, height = 220 } = {}) {
  if (!data || data.length === 0) return "";
  const pad = { top: 18, right: 20, bottom: 30, left: 44 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const barW = (w / data.length) * 0.55;
  const gap = w / data.length - barW;
  const yToPx = (pct) => pad.top + h - (pct / 100) * h;

  const barsHtml = data
    .map((p, i) => {
      const cx = pad.left + i * (barW + gap) + gap / 2;
      const barH = (p.percent / 100) * h;
      const y = yToPx(p.percent);
      const fill = p.percent >= 20 ? C.coral : C.pulse;
      const tint = p.percent >= 20 ? C.coralTint : C.pulseTint;
      return `
        <rect x="${cx}" y="${pad.top}" width="${barW}" height="${h}" fill="${tint}" opacity="0.4" rx="3"/>
        <rect x="${cx}" y="${y}" width="${barW}" height="${barH}" fill="${fill}" rx="3"/>
        <text x="${cx + barW / 2}" y="${Math.max(y - 6, pad.top + 12)}" text-anchor="middle" font-size="11" font-weight="700" fill="${fill}">${p.percent}%</text>
        <text x="${cx + barW / 2}" y="${pad.top + h + 18}" text-anchor="middle" font-size="11" fill="${C.ink3}" font-family="JetBrains Mono, monospace">R${p.round}</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}"
         preserveAspectRatio="xMidYMid meet"
         style="display:block;max-width:100%;height:auto;">
      ${[0, 25, 50, 75, 100]
        .map(
          (g) => `
        <line x1="${pad.left}" x2="${pad.left + w}" y1="${yToPx(g)}" y2="${yToPx(g)}"
              stroke="${C.line}" stroke-width="1" stroke-dasharray="${g === 0 ? "0" : "2 3"}"/>
        <text x="${pad.left - 8}" y="${yToPx(g) + 3}" text-anchor="end" font-size="10" fill="${C.ink4}" font-family="JetBrains Mono, monospace">${g}%</text>
      `
        )
        .join("")}
      <line x1="${pad.left}" x2="${pad.left + w}" y1="${yToPx(20)}" y2="${yToPx(20)}"
            stroke="${C.ink4}" stroke-width="1" stroke-dasharray="6 4"/>
      ${barsHtml}
    </svg>`;
}

/**
 * Horizontal bars — used for response rate per round and similar
 * single-axis comparisons. Renders one row per item.
 *
 * Expects `data` as [{ label, value, max }]. value/max in same units.
 */
export function horizontalBarsSvg(data, { width = 720, rowHeight = 28 } = {}) {
  if (!data || data.length === 0) return "";
  const pad = { top: 8, right: 50, bottom: 8, left: 56 };
  const trackW = width - pad.left - pad.right;
  const height = pad.top + pad.bottom + data.length * rowHeight;

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}"
         preserveAspectRatio="xMinYMin meet"
         style="display:block;max-width:100%;height:auto;">
      ${data
        .map((d, i) => {
          const max = Math.max(d.max || 100, d.value || 0);
          const ratio = Math.max(0, Math.min(1, (d.value || 0) / max));
          const y = pad.top + i * rowHeight + 8;
          return `
            <text x="${pad.left - 8}" y="${y + 12}" text-anchor="end" font-size="11" fill="${C.ink3}" font-family="JetBrains Mono, monospace">${escapeHtml(d.label)}</text>
            <rect x="${pad.left}" y="${y + 4}" width="${trackW}" height="10" fill="${C.paper3}" rx="5"/>
            <rect x="${pad.left}" y="${y + 4}" width="${trackW * ratio}" height="10" fill="${C.ink}" rx="5"/>
            <text x="${pad.left + trackW + 8}" y="${y + 12}" font-size="11" font-weight="600" fill="${C.ink}" font-family="JetBrains Mono, monospace">${d.value}${d.suffix || ""}</text>
          `;
        })
        .join("")}
    </svg>`;
}

// ──────────────────────────────────────────────────────────────────────
// Generic table helper
// ──────────────────────────────────────────────────────────────────────

/**
 * renderTable — produces a v2-styled table from rows + columns.
 *
 *   columns: [{ label, key, align, render? }]
 *   rows:    array of objects whose keys match columns[].key
 */
export function renderTable(columns, rows) {
  if (!rows || rows.length === 0) return "";
  return `
    <table>
      <thead>
        <tr>${columns
          .map(
            (c) =>
              `<th class="${c.align === "right" ? "right" : c.align === "center" ? "center" : ""}">${escapeHtml(c.label)}</th>`
          )
          .join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr>${columns
                .map((c) => {
                  const cls = c.align === "right" ? "right" : c.align === "center" ? "center" : "";
                  const raw = c.render ? c.render(r[c.key], r) : r[c.key];
                  const v = raw == null ? "—" : raw;
                  return `<td class="${cls}">${typeof v === "string" || typeof v === "number" ? escapeHtml(String(v)) : v}</td>`;
                })
                .join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

// ──────────────────────────────────────────────────────────────────────
// Color helpers — return hex for common semantic states
// ──────────────────────────────────────────────────────────────────────

export function npsHex(n) {
  if (n == null) return C.ink3;
  if (n >= 0) return C.pulseDeep;
  if (n >= -10) return C.amber;
  return C.coral;
}

export function deltaHex(n) {
  if (n == null) return C.ink4;
  if (n > 0) return C.pulseDeep;
  if (n < 0) return C.coral;
  return C.ink4;
}

// ──────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatLongDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatNps(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

export function formatCurrency(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

/**
 * Open a printable report in a new window. Caller passes the full
 * <html>...</html> document body. Returns the new window handle so
 * callers can detect popup blockers.
 */
export function openReportWindow(htmlDoc, { title = "Report" } = {}) {
  const w = window.open("", "_blank");
  if (!w) return null;
  w.document.write(htmlDoc);
  w.document.title = title;
  w.document.close();
  return w;
}
