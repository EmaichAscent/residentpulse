import { describe, it, expect } from "vitest";
import { buildWelcomeMessage } from "./chatWelcome";

describe("buildWelcomeMessage — trust-contract welcome (Phase 3)", () => {
  it("personalizes by first name and uses the named CM when available", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Zee Best Management",
      community: "Aspen Heights",
      communityManagerName: "Sarah Johnson",
    });
    expect(msg).toMatch(/^Hi Andrew/);
    // First name only of the CM, then "at {company}"
    expect(msg).toMatch(/Sarah at Zee Best Management/);
    expect(msg).not.toMatch(/Sarah Johnson at/);
  });

  it("falls back to 'your team at {company}' when no CM is assigned", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Zee Best Management",
      community: "Aspen Heights",
      communityManagerName: null,
    });
    expect(msg).toMatch(/your team at Zee Best Management asked me to check in/);
    expect(msg).not.toMatch(/at undefined/);
  });

  it("falls back to 'your management company' when company is empty", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "",
      community: "",
      communityManagerName: null,
    });
    expect(msg).toMatch(/your team at your management company/);
  });

  it("falls back to 'there' when first name is missing", () => {
    const msg = buildWelcomeMessage({
      firstName: "",
      company: "Acme PM",
      communityManagerName: null,
    });
    expect(msg).toMatch(/^Hi there/);
  });

  it("commits to 'about 5 minutes' (not '2 minutes' which contradicts the V2 depth budget)", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Acme",
      communityManagerName: null,
    });
    expect(msg).toMatch(/About 5 minutes/);
    expect(msg).not.toMatch(/Two minutes/);
  });

  it("commits to the privacy contract: summary only, never the exchange", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Acme",
      communityManagerName: null,
    });
    expect(msg).toMatch(/sees only a summary/i);
    expect(msg).toMatch(/not this conversation/i);
    // Regression: the design's original wording suggested name removal,
    // which doesn't match how the product actually works (transcripts are
    // hidden, not just names). Make sure we're not promising name removal.
    expect(msg).not.toMatch(/your name removed/i);
    expect(msg).not.toMatch(/with your name/i);
  });

  it("does NOT prompt the user to use the End Chat button (V2 rule)", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Acme",
      communityManagerName: null,
    });
    expect(msg).not.toMatch(/End Chat/i);
  });

  it("does NOT use the old 'we're collecting feedback' framing", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Acme",
      communityManagerName: null,
    });
    expect(msg).not.toMatch(/We're collecting feedback/i);
  });

  it("ends with the 'Sound good?' beat (so the trust-gate button is the next step)", () => {
    const msg = buildWelcomeMessage({
      firstName: "Andrew",
      company: "Acme",
      communityManagerName: null,
    });
    expect(msg).toMatch(/Sound good\?$/);
  });
});
