import { describe, it, expect } from "vitest";
import { computeHealth, HEALTH_ORDER } from "./clientHealth";

const today = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe("computeHealth — SuperAdmin Clients list health rules", () => {
  it("inactive status → risk (regardless of login)", () => {
    const h = computeHealth({
      status: "inactive",
      last_activity: today().toISOString(),
      active_round_count: 0,
      onboarding_complete: true,
      last_round_launched_at: null,
    });
    expect(h.kind).toBe("risk");
    expect(h.label).toMatch(/Inactive/i);
  });

  it("pending status → attention", () => {
    const h = computeHealth({
      status: "pending",
      last_activity: null,
      active_round_count: 0,
      onboarding_complete: false,
      last_round_launched_at: null,
    });
    expect(h.kind).toBe("attention");
    expect(h.label).toMatch(/Pending/i);
  });

  it("active tenant, never logged in → risk", () => {
    const h = computeHealth({
      status: "active",
      last_activity: null,
      active_round_count: 0,
      onboarding_complete: false,
      last_round_launched_at: null,
    });
    expect(h.kind).toBe("risk");
    expect(h.label).toMatch(/Never logged in/i);
  });

  it("admin login >30d ago → risk (dark)", () => {
    const h = computeHealth({
      status: "active",
      last_activity: daysAgo(45),
      active_round_count: 0,
      onboarding_complete: true,
      last_round_launched_at: daysAgo(60),
    });
    expect(h.kind).toBe("risk");
    expect(h.label).toMatch(/Dark/i);
  });

  it("active round + admin login >14d ago → risk (silent churn signal)", () => {
    const h = computeHealth({
      status: "active",
      last_activity: daysAgo(20),
      active_round_count: 1,
      onboarding_complete: true,
      last_round_launched_at: daysAgo(10),
    });
    expect(h.kind).toBe("risk");
    expect(h.label).toMatch(/Dormant/i);
  });

  it("login 14–30d, no active round → attention (quiet)", () => {
    const h = computeHealth({
      status: "active",
      last_activity: daysAgo(20),
      active_round_count: 0,
      onboarding_complete: true,
      last_round_launched_at: daysAgo(60),
    });
    expect(h.kind).toBe("attention");
    expect(h.label).toMatch(/Quiet/i);
  });

  it("recent login but onboarding incomplete → attention", () => {
    const h = computeHealth({
      status: "active",
      last_activity: daysAgo(2),
      active_round_count: 0,
      onboarding_complete: false,
      last_round_launched_at: null,
    });
    expect(h.kind).toBe("attention");
    expect(h.label).toMatch(/Onboarding incomplete/i);
  });

  it("recent login, onboarded, never launched a round → attention (no round ever)", () => {
    const h = computeHealth({
      status: "active",
      last_activity: daysAgo(3),
      active_round_count: 0,
      onboarding_complete: true,
      last_round_launched_at: null,
    });
    expect(h.kind).toBe("attention");
    expect(h.label).toMatch(/No round ever/i);
  });

  it("recent login + onboarded + has round history → good", () => {
    const h = computeHealth({
      status: "active",
      last_activity: daysAgo(3),
      active_round_count: 1,
      onboarding_complete: true,
      last_round_launched_at: daysAgo(20),
    });
    expect(h.kind).toBe("good");
    expect(h.label).toMatch(/Healthy/i);
  });

  it("HEALTH_ORDER puts risk first (so default sort surfaces risk on top)", () => {
    expect(HEALTH_ORDER.risk).toBeLessThan(HEALTH_ORDER.attention);
    expect(HEALTH_ORDER.attention).toBeLessThan(HEALTH_ORDER.good);
  });
});
