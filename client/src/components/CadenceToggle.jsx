/**
 * CadenceToggle — segmented control for the survey-cadence picker
 * (2×/yr vs 4×/yr). Single shared implementation used wherever a
 * board-survey cadence appears so the same control reads identically
 * across the app.
 *
 * Previously there were three implementations with slightly different
 * styling (AccountSettings.jsx had separate "2× / year" buttons,
 * RoundsLanding.jsx had a white-active segmented pill, Home.jsx had
 * an ink-active segmented pill). This unifies them on the ink-active
 * compact style.
 *
 * Props:
 *   value         current cadence (2 or 4)
 *   maxAllowed    cap from the subscription plan; >maxAllowed options
 *                 render disabled with a "requires plan upgrade" tooltip
 *   onChange      called with the new value when an option is clicked
 *   disabled      forces all options disabled (e.g. while saving)
 *   size          "sm" | "md" | "lg" — controls padding + text size.
 *                 Default "md" matches the Survey-rounds card. Use
 *                 "lg" inside Settings panels.
 */
export default function CadenceToggle({
  value,
  maxAllowed = 4,
  onChange,
  disabled = false,
  size = "md",
}) {
  const sizeStyles = {
    sm: { padding: "3px 9px", fontSize: 11 },
    md: { padding: "5px 11px", fontSize: 12 },
    lg: { padding: "7px 14px", fontSize: 12.5 },
  };
  const s = sizeStyles[size] || sizeStyles.md;
  const options = [
    { v: 2, label: "2×/yr" },
    { v: 4, label: "4×/yr" },
  ];

  return (
    <div
      className="inline-flex rounded-lg"
      style={{
        backgroundColor: "var(--paper-2)",
        border: "1px solid var(--line)",
        padding: 2,
      }}
    >
      {options.map((o) => {
        const active = value === o.v;
        const isDisabled = disabled || o.v > maxAllowed;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => !active && !isDisabled && onChange?.(o.v)}
            disabled={isDisabled}
            className="font-semibold rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              padding: s.padding,
              fontSize: s.fontSize,
              backgroundColor: active ? "var(--ink)" : "transparent",
              color: active ? "white" : "var(--ink-3)",
              border: "none",
              cursor: isDisabled ? "not-allowed" : active ? "default" : "pointer",
            }}
            title={
              o.v > maxAllowed
                ? `${o.label} requires plan upgrade`
                : `Set survey cadence to ${o.label}`
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
