/**
 * CadenceToggle — segmented control for the survey-cadence picker
 * (2×/yr vs 4×/yr). Single shared implementation used wherever a
 * board-survey cadence appears so the same control reads identically
 * across the app.
 *
 * One canonical size, on purpose. Earlier versions exposed a `size`
 * prop with sm/md/lg variants — that re-introduced the visual drift
 * the component was meant to eliminate. If a context needs more or
 * less prominence, give the surrounding label/spacing the difference,
 * not the toggle itself.
 *
 * Props:
 *   value         current cadence (2 or 4)
 *   maxAllowed    cap from the subscription plan; >maxAllowed options
 *                 render disabled with a "requires plan upgrade"
 *                 tooltip — UNLESS that option is the currently active
 *                 one (we don't lock you out of your own setting if
 *                 your plan was downgraded after the fact).
 *   onChange      called with the new value when an option is clicked
 *   disabled      forces all options disabled (e.g. while saving)
 */
export default function CadenceToggle({ value, maxAllowed = 4, onChange, disabled = false }) {
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
        // Never disable the currently-active option, even if it now
        // exceeds maxAllowed (plan downgrade case). Disabling it would
        // hide the user's actual setting and look broken.
        const isDisabled = disabled || (!active && o.v > maxAllowed);
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => !active && !isDisabled && onChange?.(o.v)}
            disabled={isDisabled}
            className="font-semibold rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              padding: "5px 12px",
              fontSize: 12,
              backgroundColor: active ? "var(--ink)" : "transparent",
              color: active ? "white" : "var(--ink-3)",
              border: "none",
              cursor: isDisabled ? "not-allowed" : active ? "default" : "pointer",
            }}
            title={
              o.v > maxAllowed && !active
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
