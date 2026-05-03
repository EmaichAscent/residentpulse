/**
 * NPS chart helpers — hand-rolled SVG, no recharts dependency.
 *
 * Ported directly from the design handoff bundle:
 *   DESIGN/design_handoff_clientapp/src/charts.jsx
 *
 * These are intentionally low-level visual primitives. Higher-level
 * composition (the cards they live in, the grid that arranges them) is
 * the page's job, not these components'.
 *
 * Color references use the design tokens defined in client/src/index.css:
 *   var(--coral)     — detractor / declining
 *   var(--amber)     — passive / flat
 *   var(--pulse)     — promoter / improving
 *   var(--ink)       — neutral primary text
 *   var(--ink-3..5)  — muted text + grid lines
 *   var(--paper-3)   — empty bar track
 *   var(--line)      — thin separators
 */

/**
 * Tiny sparkline. Renders a filled-area line over a sequence of
 * numbers. Used on the Home page response-rate card to show round-
 * over-round trend at a glance. Auto-scales to data range; if all
 * values are equal, the line is drawn flat at the midline.
 */
export function Sparkline({
  data,
  width = 240,
  height = 36,
  color = "var(--ink)",
  strokeWidth = 1.5,
}) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const lastIdx = data.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = height - ((data[lastIdx] - min) / range) * height;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height={height}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
      role="img"
      aria-label="Trend sparkline"
    >
      <polyline points={areaPoints} fill={color} fillOpacity="0.08" stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

/**
 * Semicircle NPS gauge with detractor/passive/promoter zones, current-
 * value needle, and an optional dashed prev-value tick.
 *
 * Range: -100..100 mapped to a 180°→0° arc (left=detractor, right=promoter).
 *
 * Default size 200px. The svg height is 78% of the size (semicircle +
 * a touch of headroom for the needle pivot).
 */
export function NpsGauge({ value, prev, size = 200 }) {
  const cx = size / 2;
  const cy = size * 0.62;
  const r = size * 0.42;

  // Map -100..100 to 180..0 deg
  const valToAngle = (v) => 180 - ((Math.max(-100, Math.min(100, v)) + 100) / 200) * 180;
  const angle = valToAngle(value);
  const prevAngle = prev != null ? valToAngle(prev) : null;

  const polar = (a) => [
    cx + r * Math.cos((a * Math.PI) / 180),
    cy - r * Math.sin((a * Math.PI) / 180),
  ];

  const arc = (start, end, color) => {
    const [x1, y1] = polar(start);
    const [x2, y2] = polar(end);
    const large = Math.abs(end - start) > 180 ? 1 : 0;
    const sweep = end > start ? 0 : 1;
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="butt"
      />
    );
  };

  const [px, py] = polar(angle);

  return (
    <svg
      viewBox={`0 0 ${size} ${size * 0.78}`}
      preserveAspectRatio="xMidYMid meet"
      width={size}
      height={size * 0.78}
      style={{ maxWidth: "100%", height: "auto" }}
      role="img"
      aria-label={`NPS gauge showing ${value}${prev != null ? ` (was ${prev})` : ""}`}
    >
      {/* Track — three colored arc segments for the score zones */}
      {arc(180, 120, "var(--coral)")}
      {arc(120, 60, "var(--amber)")}
      {arc(60, 0, "var(--pulse)")}

      {/* Previous-value tick (dashed) */}
      {prevAngle != null && (
        <line
          x1={cx + (r - 12) * Math.cos((prevAngle * Math.PI) / 180)}
          y1={cy - (r - 12) * Math.sin((prevAngle * Math.PI) / 180)}
          x2={cx + (r + 12) * Math.cos((prevAngle * Math.PI) / 180)}
          y2={cy - (r + 12) * Math.sin((prevAngle * Math.PI) / 180)}
          stroke="var(--ink-4)"
          strokeWidth="2"
          strokeDasharray="2 2"
        />
      )}

      {/* Needle + pivot */}
      <line
        x1={cx}
        y1={cy}
        x2={px}
        y2={py}
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="6" fill="var(--ink)" />
      <circle cx={cx} cy={cy} r="2.5" fill="white" />
    </svg>
  );
}

/**
 * Compact horizontal NPS bar (-100..100) with a center tick.
 * Used in roster lists (At-risk, Champions, By Location, Revenue at risk).
 *
 * Negative values draw left from center in coral; positive values draw
 * right in pulse-green. An optional `prev` marker draws a thin gray
 * vertical line at the previous round's position.
 */
export function NpsBar({ value, prev, width = 100, height = 8 }) {
  const v = Math.max(-100, Math.min(100, value));
  const pct = (n) => ((n + 100) / 200) * 100;
  const isNeg = v < 0;

  return (
    <div style={{ width, position: "relative" }} role="img" aria-label={`NPS bar showing ${value}`}>
      <div
        style={{
          height,
          borderRadius: 999,
          background: "var(--paper-3)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Center tick (the zero line) */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--ink-5)",
          }}
        />
        {/* Fill — grows left or right from center */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: isNeg ? `${pct(v)}%` : "50%",
            width: `${Math.abs(pct(v) - 50)}%`,
            background: isNeg ? "var(--coral)" : "var(--pulse)",
            borderRadius: 999,
          }}
        />
        {/* Previous-round marker */}
        {prev != null && (
          <div
            style={{
              position: "absolute",
              top: -2,
              bottom: -2,
              left: `${pct(prev)}%`,
              width: 2,
              background: "var(--ink-3)",
              transform: "translateX(-1px)",
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Line chart for round-over-round NPS. Shows a single line with dots
 * + value labels above each dot, plus subtle background tinting for the
 * detractor/promoter zones (below/above zero).
 *
 * Expects `data` as an array of { round: string, nps: number }.
 */
export function NpsLineChart({ data, width = 600, height = 220, color = "var(--ink)" }) {
  if (!data || data.length === 0) return null;

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

  // viewBox + 100% width lets the chart scale to its container instead
  // of overflowing when callers pass a width larger than the container
  // (e.g. width=1100 in TrendsView's NPS-over-time card). The internal
  // coordinate math keeps using the literal `width` prop — only the
  // rendered size scales.
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height={height}
      role="img"
      aria-label={`NPS over ${data.length} rounds`}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      {/* Zone backgrounds */}
      <rect
        x={pad.left}
        y={yToPx(0)}
        width={w}
        height={yToPx(yMin) - yToPx(0)}
        fill="var(--coral)"
        opacity="0.04"
      />
      <rect
        x={pad.left}
        y={yToPx(yMax)}
        width={w}
        height={yToPx(0) - yToPx(yMax)}
        fill="var(--pulse)"
        opacity="0.04"
      />

      {/* Gridlines + y labels */}
      {gridY.map((g) => (
        <g key={g}>
          <line
            x1={pad.left}
            x2={pad.left + w}
            y1={yToPx(g)}
            y2={yToPx(g)}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray={g === 0 ? "0" : "2 3"}
          />
          <text
            x={pad.left - 8}
            y={yToPx(g) + 3}
            fontSize="10"
            fill="var(--ink-4)"
            textAnchor="end"
          >
            {g}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text
          key={i}
          x={pad.left + i * stepX}
          y={height - 8}
          fontSize="10.5"
          fill="var(--ink-3)"
          textAnchor="middle"
          fontWeight="500"
        >
          {d.round}
        </text>
      ))}

      {/* Line + dots + value labels */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4.5" fill="white" stroke={color} strokeWidth="2" />
          <text
            x={p[0]}
            y={p[1] - 12}
            fontSize="11"
            fontWeight="600"
            fill={color}
            textAnchor="middle"
          >
            {data[i].nps > 0 ? "+" : ""}
            {data[i].nps}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Stacked bar chart showing detractor/passive/promoter shares per
 * round. Used on the Trends page for cohort movement.
 *
 * Expects `data` as an array of
 *   { round: string, detractors: number, passives: number, promoters: number }.
 *
 * Counts can be either raw numbers or percentages — the chart normalizes
 * each bar to 100% of its own total.
 */
export function StackedSentimentBars({ data, width = 600, height = 220 }) {
  if (!data || data.length === 0) return null;

  const pad = { top: 12, right: 20, bottom: 26, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const barW = (w / data.length) * 0.55;
  const gap = w / data.length - barW;

  // viewBox + 100% width keeps the chart inside its container at any
  // viewport size (the cohort card sits in a 2-col grid that's often
  // narrower than the default 600 / explicit 620 width prop).
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height={height}
      role="img"
      aria-label="Cohort movement over rounds"
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      {/* Gridlines + y labels (percentage scale) */}
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line
            x1={pad.left}
            x2={pad.left + w}
            y1={pad.top + h - (g / 100) * h}
            y2={pad.top + h - (g / 100) * h}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray={g === 0 ? "0" : "2 3"}
          />
          <text
            x={pad.left - 8}
            y={pad.top + h - (g / 100) * h + 3}
            fontSize="9.5"
            fill="var(--ink-4)"
            textAnchor="end"
          >
            {g}%
          </text>
        </g>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const total = (d.detractors || 0) + (d.passives || 0) + (d.promoters || 0);
        if (total === 0) return null;
        const x = pad.left + i * (w / data.length) + gap / 2;
        let y = pad.top + h;
        const sections = [
          { v: d.promoters || 0, c: "var(--pulse)" },
          { v: d.passives || 0, c: "var(--amber)" },
          { v: d.detractors || 0, c: "var(--coral)" },
        ];
        return (
          <g key={i}>
            {sections.map((s, si) => {
              const sh = (s.v / total) * h;
              y -= sh;
              return <rect key={si} x={x} y={y} width={barW} height={sh - 1} fill={s.c} rx="2" />;
            })}
            <text
              x={x + barW / 2}
              y={height - 8}
              fontSize="10.5"
              fill="var(--ink-3)"
              textAnchor="middle"
              fontWeight="500"
            >
              {d.round}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
