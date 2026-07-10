import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// closeFlow → aiRouter → db.js, which opens a pool on import.
vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

const { CLOSE_PHASE, generateReviewAsk, parseReviewReply } = await import("./closeFlow.js");

const __dirname = dirname(fileURLToPath(import.meta.url));

// Hybrid promoter review ask — server-driven replacement for the
// legacy model-driven fast-path. Sequenced AFTER the baseline batch,
// so a promoter's required questions are never sacrificed for the ask.

describe("review close phase + templates", () => {
  it("adds the awaiting_review_response phase to the machine", () => {
    expect(CLOSE_PHASE.AWAITING_REVIEW_RESPONSE).toBe("awaiting_review_response");
  });

  it("the ask names the client and stays to one question", () => {
    const ask = generateReviewAsk("Cadden Community Management");
    expect(ask).toMatch(/Cadden Community Management/);
    expect(ask).toMatch(/Google review/);
    expect((ask.match(/\?/g) || []).length).toBe(1);
  });
});

describe("parseReviewReply — conservative by design", () => {
  it("clear yeses count", () => {
    for (const msg of ["yes", "Sure!", "absolutely", "happy to", "Yeah why not", "ok"]) {
      expect(parseReviewReply(msg)).toBe("yes");
    }
  });

  it("clear nos count", () => {
    for (const msg of ["no", "Nope", "I'd rather not", "no thanks", "pass"]) {
      expect(parseReviewReply(msg)).toBe("no");
    }
  });

  it("negation beats an embedded yes ('no... okay?' must not push a link)", () => {
    expect(parseReviewReply("no, but okay survey")).toBe("no");
    expect(parseReviewReply("I don't think so, ok?")).toBe("no");
  });

  it("ambiguity defaults to no — never push a review link on a maybe", () => {
    expect(parseReviewReply("hmm")).toBe("no");
    expect(parseReviewReply("maybe later")).toBe("no");
    expect(parseReviewReply("")).toBe("no");
    expect(parseReviewReply(null)).toBe("no");
  });
});

describe("chat.js review wiring — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("legacy model-driven fast-path is gated to legacy sessions only", () => {
    expect(source).toMatch(
      /promptKey === "system_prompt" &&\s+session\.nps_score !== null &&\s+!session\.google_review_response/
    );
  });

  it("hybrid review ask fires at BOTH close entry points, after required delivery", () => {
    // Turn-count/terminal close (no required remaining)
    expect(source).toMatch(
      /session\.template_version_id && \(await sessionQualifiesForReview\(session\)\)/
    );
    // Baseline-batch exhaustion in the /answer continuation
    expect(source).toMatch(/baseline batch complete, promoter qualifies/);
  });

  it("the /answer continuation refreshes the session before qualifying (NPS may have just landed)", () => {
    expect(source).toMatch(/may have BEEN the NPS/);
  });

  it("the review response records and the templated close follows with chat_end", () => {
    expect(source).toMatch(/CLOSE_PHASE\.AWAITING_REVIEW_RESPONSE/);
    expect(source).toMatch(/parseReviewReply\(message\)/);
    expect(source).toMatch(/review response: \$\{reviewResponse\}/);
    expect(source).toMatch(/the review link will appear as soon as this chat wraps/);
  });
});
