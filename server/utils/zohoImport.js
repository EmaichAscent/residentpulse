/**
 * Zoho historical-import mapping (Zoho parity Phase F —
 * docs/ZOHO_PARITY_PLAN.md). Pure functions + the column map, kept out
 * of the ops script so they're unit-testable.
 *
 * The Cadden export ("Survey Detail Report … 7.2.2026") mixes TWO
 * answer vocabularies across survey groups — Zoho's scale changed
 * over time:
 *
 *   absolute:  Very Poor / Poor / Fair / Good / Excellent
 *              → mapped onto our 1–5 likert. These rows join native
 *                trend lines DIRECTLY (value_numeric set).
 *   delta:     Declined / Somewhat Declined / The Same / No Change /
 *              Somewhat Improved / Improved / Greatly Improved
 *              → no absolute anchor exists; preserved as labeled
 *                delta rows (value_numeric NULL, value_json carries
 *                the label + a signed magnitude). Dashboards render
 *                these in delta mode.
 *
 * Both kinds keep the ORIGINAL label in value_json.zoho_label so
 * nothing is lost in translation.
 */

// Exact Zoho column header → seeded question code (seed-survey-catalog.js).
// M01 (Manager overall) has no Zoho counterpart — native-only.
export const COLUMN_TO_CODE = Object.freeze({
  "Value For Services": "C01",
  "Friendliness of Staff": "C02",
  Communication: "C03",
  "Response Time": "C04",
  Transparency: "C05",
  "Systems & Technology": "C06",
  "Online Resources": "C07",
  "Board Training": "C08",
  "Effectively Enforces Deed Restrictions": "Y01",
  "Manages common areas & amenities": "Y02",
  "Provides detailed monthly status reports": "Y03",
  "Conducts effective annual meetings": "Y04",
  "Responsive to owner calls and concerns": "Y05",
  "Effectively communicates with the membership": "Y06",
  "Maintains accurate records": "Y07",
  Knowledgeable: "M02",
  "Good Communicator": "M03",
  Responsive: "M04",
  Professional: "M05",
  Friendly: "M06",
  Prepared: "M07",
  Organized: "M08",
  Informed: "M09",
  "Understands the Board goals": "M10",
  "Manages vendor contracts & performance": "M11",
  "Actively participates in Board meetings": "M12",
  "Understands how to prioritize tasks": "M13",
  "Proactive communication post meeting": "M14",
  "Accuracy of Financials": "F01",
  "Timeliness of Financials": "F02",
  "Accounts Receivable Management": "F03",
  "Collections Management": "F04",
  "Accounts Payable Management": "F05",
  "Budget Management": "F06",
  "Budget Preparation Process": "F07",
  "Reserve Management": "F08",
  Reporting: "F09",
  "Manager Comments": "M15",
  "Financial Comments": "F10",
  "New Concerns or Priorities": "C09",
  "Valuable areas for management to focus resources": "C10",
  "Community Priorities": "Y08",
  "Change in Board Support": "C11",
  "NPS Change Reason": "C12",
});

const ABSOLUTE_MAP = Object.freeze({
  "very poor": 1,
  poor: 2,
  fair: 3,
  good: 4,
  excellent: 5,
});

const DELTA_MAP = Object.freeze({
  declined: -2,
  "somewhat declined": -1,
  "the same": 0,
  "no change": 0,
  "somewhat improved": 1,
  improved: 2,
  "greatly improved": 2,
});

/**
 * Normalize one rating cell.
 * Returns:
 *   { kind: 'absolute', numeric, label }
 *   { kind: 'delta', delta, label }
 *   { kind: 'unknown', label }   — imported as text so nothing is lost
 *   null                          — blank cell = not answered = no row
 */
export function normalizeRatingValue(raw) {
  const label = (raw ?? "").toString().trim();
  if (!label) return null;
  const key = label.toLowerCase();
  if (key in ABSOLUTE_MAP) return { kind: "absolute", numeric: ABSOLUTE_MAP[key], label };
  if (key in DELTA_MAP) return { kind: "delta", delta: DELTA_MAP[key], label };
  return { kind: "unknown", label };
}

/**
 * Zoho splits the score across two columns: "NPS (Survey Information)"
 * holds the first-round score, "Follow Up NPS …" the later rounds'.
 * The effective score is whichever is present (NPS wins when both are).
 */
export function effectiveNps(row) {
  for (const col of ["NPS (Survey Information)", "Follow Up NPS (Survey Information)"]) {
    const v = (row[col] ?? "").toString().trim();
    if (v !== "") {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 10) return n;
    }
  }
  return null;
}

/** "06-16-2026" (MM-DD-YYYY, the export's format) → "2026-06-16". */
export function parseSubmissionDate(raw) {
  const m = (raw ?? "")
    .toString()
    .trim()
    .match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}
