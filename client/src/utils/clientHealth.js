/**
 * Client health computation — used by the SuperAdmin Clients list
 * (PR 8 of the SuperAdmin overhaul) to render the leftmost "Health"
 * column with risk/attention/good dots, and to drive the Status
 * filter chips ("Dormant", "Onboarding incomplete").
 *
 * Computed client-side from the enriched /clients payload so the
 * rules can iterate without a server deploy. Inputs:
 *
 *   client.status                     — 'active' | 'pending' | 'inactive'
 *   client.last_activity              — most recent admin login timestamp
 *   client.last_round_launched_at     — most recent launched round
 *   client.active_round_count         — count of in_progress rounds
 *   client.onboarding_complete        — any admin completed onboarding
 *
 * Output: { kind: 'risk' | 'attention' | 'good', label: string }
 */

export const HEALTH_ORDER = { risk: 0, attention: 1, good: 2, unknown: 3 };

export function computeHealth(client) {
  const days = (ts) => (ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : null);
  const sinceLogin = days(client.last_activity);
  const sinceRound = days(client.last_round_launched_at);

  // Inactive tenants are always risk — they're losing access.
  if (client.status === "inactive") {
    return { kind: "risk", label: "Inactive" };
  }
  // Pending tenants haven't onboarded — attention so the operator can
  // nudge them, not risk (they may be brand new).
  if (client.status === "pending") {
    return { kind: "attention", label: "Pending" };
  }

  // Login-based risk gates.
  if (sinceLogin === null) {
    return { kind: "risk", label: "Never logged in" };
  }
  if (sinceLogin > 30) {
    return { kind: "risk", label: `Dark ${sinceLogin}d` };
  }

  // The silent-churn case: an active round but no admin in the loop.
  if (client.active_round_count > 0 && sinceLogin > 14) {
    return { kind: "risk", label: "Dormant, active round" };
  }
  if (sinceLogin > 14) {
    return { kind: "attention", label: `Quiet ${sinceLogin}d` };
  }

  // Operational gaps short of risk.
  if (!client.onboarding_complete) {
    return { kind: "attention", label: "Onboarding incomplete" };
  }
  if (client.active_round_count === 0 && sinceRound === null) {
    return { kind: "attention", label: "No round ever" };
  }

  return { kind: "good", label: "Healthy" };
}
