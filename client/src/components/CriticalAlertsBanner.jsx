import { useState, useEffect } from "react";

export default function CriticalAlertsBanner({ onViewRound }) {
  const [alerts, setAlerts] = useState([]);
  const [dismissing, setDismissing] = useState(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const res = await fetch("/api/admin/alerts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (err) {
      console.error("Failed to load alerts:", err);
    }
  };

  const handleDismiss = async (alertId) => {
    setDismissing(alertId);
    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    } finally {
      setDismissing(null);
    }
  };

  if (alerts.length === 0) return null;

  const alertTypeLabel = (type) => {
    switch (type) {
      case "contract_termination": return "Contract Risk";
      case "legal_threat": return "Legal Threat";
      case "safety_concern": return "Safety Concern";
      default: return "Critical Alert";
    }
  };

  const alertColor = (severity) =>
    severity === "critical"
      ? "bg-red-50 border-red-200"
      : "bg-amber-50 border-amber-200";

  const alertTextColor = (severity) =>
    severity === "critical" ? "text-red-800" : "text-amber-800";

  const alertBadgeColor = (severity) =>
    severity === "critical"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";

  return (
    <div className="space-y-2 mb-6">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-lg border p-4 ${alertColor(alert.severity)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <svg
                className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alert.severity === "critical" ? "text-red-500" : "text-amber-500"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${alertBadgeColor(alert.severity)}`}>
                    {alertTypeLabel(alert.alert_type)}
                  </span>
                  {alert.round_number && (
                    <span className="text-xs text-gray-500">Round {alert.round_number}</span>
                  )}
                  {alert.community_name && (
                    <span className="text-xs text-gray-500">{alert.community_name}</span>
                  )}
                </div>
                <p className={`text-sm font-medium ${alertTextColor(alert.severity)}`}>
                  {alert.first_name || alert.last_name
                    ? `${alert.first_name || ""} ${alert.last_name || ""}`.trim()
                    : alert.user_email || "Board member"}{" "}
                  — {alert.description}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(alert.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {alert.round_id && onViewRound && (
                <button
                  onClick={() => onViewRound(alert.round_id)}
                  className="text-xs font-medium text-gray-600 hover:text-gray-800 underline"
                >
                  View
                </button>
              )}
              <button
                onClick={() => handleDismiss(alert.id)}
                disabled={dismissing === alert.id}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50"
                title="Dismiss alert"
              >
                {dismissing === alert.id ? "..." : "Dismiss"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
