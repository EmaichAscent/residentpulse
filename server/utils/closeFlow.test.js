import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./aiRouter.js", () => ({
  createMessage: vi.fn(),
}));

let aiRouter;
let closeFlow;

beforeEach(async () => {
  vi.resetModules();
  aiRouter = await import("./aiRouter.js");
  closeFlow = await import("./closeFlow.js");
  aiRouter.createMessage.mockResolvedValue({
    content: [
      {
        type: "text",
        text: "Southern States is doing well on report accuracy. Responsiveness is the issue. Anything missing from that, or anything else I should pass along?",
      },
    ],
  });
});

// ──────────────────────────────────────────────────────────────────────
// Detection helpers
// ──────────────────────────────────────────────────────────────────────

describe("userSignaledDone", () => {
  it("matches single-word terminal answers", () => {
    expect(closeFlow.userSignaledDone("no")).toBe(true);
    expect(closeFlow.userSignaledDone("nope")).toBe(true);
    expect(closeFlow.userSignaledDone("nothing")).toBe(true);
    expect(closeFlow.userSignaledDone("none")).toBe(true);
    expect(closeFlow.userSignaledDone("N/A")).toBe(true);
    expect(closeFlow.userSignaledDone("No.")).toBe(true);
  });

  it("matches multi-word terminal phrases", () => {
    expect(closeFlow.userSignaledDone("that's all I have")).toBe(true);
    expect(closeFlow.userSignaledDone("that's it")).toBe(true);
    expect(closeFlow.userSignaledDone("I'm good thanks")).toBe(true);
    expect(closeFlow.userSignaledDone("I have to go")).toBe(true);
    expect(closeFlow.userSignaledDone("I think that's enough")).toBe(true);
    expect(closeFlow.userSignaledDone("nothing else comes to mind")).toBe(true);
  });

  it("does NOT match substantive answers that contain a 'no'", () => {
    expect(closeFlow.userSignaledDone("no, the manager is great")).toBe(false);
    expect(closeFlow.userSignaledDone("no but the financials are inaccurate")).toBe(false);
    expect(
      closeFlow.userSignaledDone("not specifically — it's more an overall workload thing")
    ).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(closeFlow.userSignaledDone(undefined)).toBe(false);
    expect(closeFlow.userSignaledDone(null)).toBe(false);
    expect(closeFlow.userSignaledDone(12)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Trigger logic
// ──────────────────────────────────────────────────────────────────────

describe("shouldFirePlayback", () => {
  it("does NOT trigger before the threshold even with terminal language", () => {
    // V3.0 minimum: don't close after just 2 questions even if user
    // says "no" — they'd be answering one question, not closing.
    expect(closeFlow.shouldFirePlayback({ aiMessageCount: 2, userMessage: "no" })).toBe(false);
    expect(closeFlow.shouldFirePlayback({ aiMessageCount: 1, userMessage: "that's all" })).toBe(
      false
    );
  });

  it("triggers from terminal language once MIN_TURNS_BEFORE_TERMINAL_CLOSE is reached", () => {
    expect(closeFlow.shouldFirePlayback({ aiMessageCount: 3, userMessage: "no, that's it" })).toBe(
      true
    );
    expect(closeFlow.shouldFirePlayback({ aiMessageCount: 4, userMessage: "nope" })).toBe(true);
  });

  it("triggers from turn count alone at PLAYBACK_TURN_THRESHOLD even without terminal language", () => {
    // We can't run forever — V3.0's "Stop at 7" rule. After
    // PLAYBACK_TURN_THRESHOLD AI messages, force the playback no
    // matter what the user said.
    expect(
      closeFlow.shouldFirePlayback({
        aiMessageCount: closeFlow.__TEST__.PLAYBACK_TURN_THRESHOLD,
        userMessage: "the financial reports are sometimes inaccurate",
      })
    ).toBe(true);
  });

  it("does NOT trigger on substantive non-terminal answers below threshold", () => {
    expect(
      closeFlow.shouldFirePlayback({
        aiMessageCount: 4,
        userMessage: "the back office is the main issue, especially around financials",
      })
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Time-sensitive complaint detection
// ──────────────────────────────────────────────────────────────────────

describe("isTimeSensitiveComplaint", () => {
  it("detects responsiveness/communication complaints", () => {
    expect(
      closeFlow.isTimeSensitiveComplaint(
        "I keep calling and no one calls back. Emails sit for days."
      )
    ).toBe(true);
    expect(
      closeFlow.isTimeSensitiveComplaint(
        "Communication is broken — priorities raised at meetings just go quiet."
      )
    ).toBe(true);
    expect(closeFlow.isTimeSensitiveComplaint("Slow follow-up on the maintenance items.")).toBe(
      true
    );
  });

  it("returns false for non-time-sensitive themes (vendor performance, training)", () => {
    expect(
      closeFlow.isTimeSensitiveComplaint(
        "The landscaping vendor's performance is uneven across communities."
      )
    ).toBe(false);
    expect(
      closeFlow.isTimeSensitiveComplaint(
        "We'd like a structured training roadmap for new directors."
      )
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Final close (templated, no LLM)
// ──────────────────────────────────────────────────────────────────────

describe("generateFinalClose", () => {
  it("includes the canonical closing line + [CHAT:END] always", () => {
    const out = closeFlow.generateFinalClose({
      clientName: "Southern States",
      conversationText: "irrelevant",
    });
    expect(out).toMatch(/Thank you for your time, I'm concluding this chat\./);
    expect(out).toMatch(/\[CHAT:END\]$/);
  });

  it("includes the what-happens-next sentence with the client name", () => {
    const out = closeFlow.generateFinalClose({
      clientName: "Acme HOA Mgmt",
      conversationText: "vendor performance",
    });
    expect(out).toMatch(/This goes back to Acme HOA Mgmt as part of this round's results/);
    expect(out).toMatch(/Patterns across multiple board members tend to drive their action plans/);
  });

  it("INCLUDES the faster-channel bridge for time-sensitive complaints", () => {
    const out = closeFlow.generateFinalClose({
      clientName: "Southern States",
      conversationText: "no one calls back, emails sit for days",
    });
    expect(out).toMatch(/please reach out to them directly/);
    expect(out).toMatch(/faster channel than a quarterly survey/);
  });

  it("OMITS the faster-channel bridge for non-time-sensitive complaints", () => {
    const out = closeFlow.generateFinalClose({
      clientName: "Southern States",
      conversationText: "we'd like more board education and training programs",
    });
    expect(out).not.toMatch(/please reach out to them directly/);
    expect(out).not.toMatch(/faster channel/);
  });

  it("never contains forbidden sycophantic phrases the model used to inject", () => {
    const out = closeFlow.generateFinalClose({
      clientName: "Southern States",
      conversationText: "responsiveness issues",
    });
    expect(out).not.toMatch(/Thanks/);
    expect(out).not.toMatch(/I appreciate/);
    expect(out).not.toMatch(/That's (great|excellent|critical|good|helpful)/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Playback (scoped LLM call via aiRouter)
// ──────────────────────────────────────────────────────────────────────

describe("generatePlayback", () => {
  it("calls the AI router with a tight scoped system prompt", async () => {
    await closeFlow.generatePlayback({
      clientName: "Southern States",
      history: [
        { role: "user", content: "My NPS is 6" },
        { role: "assistant", content: "What's the biggest gap?" },
        { role: "user", content: "responsiveness" },
      ],
    });

    expect(aiRouter.createMessage).toHaveBeenCalledTimes(1);
    const params = aiRouter.createMessage.mock.calls[0][0];
    expect(params.system).toMatch(/Southern States/);
    expect(params.system).toMatch(
      /Anything missing from that, or anything else I should pass along/
    );
    // Transcript is passed inline as a single user-role message — NOT
    // replayed turn-by-turn. Replaying triggers "keep asking questions"
    // pattern bias in Sonnet. (We saw this fail in production.)
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(params.messages[0].content).toMatch(/Board member: My NPS is 6/);
    expect(params.messages[0].content).toMatch(/Interviewer: What's the biggest gap\?/);
    expect(params.messages[0].content).toMatch(/Board member: responsiveness/);
    expect(params.messages[0].content).toMatch(/Do NOT continue the interview/);
  });

  it("strips any [CHAT:END] tag from the playback (defense-in-depth)", async () => {
    aiRouter.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "Reports are accurate. Responsiveness is the issue. Anything missing from that, or anything else I should pass along? [CHAT:END]",
        },
      ],
    });

    const out = await closeFlow.generatePlayback({
      clientName: "Southern States",
      history: [{ role: "user", content: "x" }],
    });

    expect(out).not.toMatch(/\[CHAT:END\]/);
    expect(out).toMatch(/Anything missing from that, or anything else I should pass along/);
  });

  it("appends the canonical closing question if the model dropped it", async () => {
    // Production failure mode — Sonnet ignored the playback prompt and
    // produced a fresh interview question instead. The fallback ensures
    // the gate logic still has the canonical question to anchor on.
    aiRouter.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "Let me ask it this way — what kind of issues are you reaching out about?",
        },
      ],
    });

    const out = await closeFlow.generatePlayback({
      clientName: "Southern States",
      history: [{ role: "user", content: "x" }],
    });

    expect(out).toMatch(/Anything missing from that, or anything else I should pass along\?$/);
  });

  it("does NOT double-append the canonical question when already present", async () => {
    aiRouter.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "Reports good. Responsiveness slow. Anything missing from that, or anything else I should pass along?",
        },
      ],
    });

    const out = await closeFlow.generatePlayback({
      clientName: "Southern States",
      history: [{ role: "user", content: "x" }],
    });

    const matches = out.match(/Anything missing from that/g) || [];
    expect(matches).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// stripChatEndTag
// ──────────────────────────────────────────────────────────────────────

describe("stripChatEndTag", () => {
  it("removes [CHAT:END] tags from the end of a string", () => {
    expect(closeFlow.stripChatEndTag("Done! [CHAT:END]")).toBe("Done!");
  });
  it("removes mid-string [CHAT:END] tags too", () => {
    // The regex absorbs surrounding whitespace so the cleaned output
    // doesn't end up with awkward double spaces.
    expect(closeFlow.stripChatEndTag("Hi [CHAT:END] there")).toBe("Hithere");
  });
  it("is case-insensitive", () => {
    expect(closeFlow.stripChatEndTag("Done! [chat:end]")).toBe("Done!");
    expect(closeFlow.stripChatEndTag("Done! [Chat:End]")).toBe("Done!");
  });
  it("leaves strings without the tag untouched", () => {
    expect(closeFlow.stripChatEndTag("Just a normal message.")).toBe("Just a normal message.");
  });
  it("returns non-string inputs unchanged", () => {
    expect(closeFlow.stripChatEndTag(undefined)).toBe(undefined);
    expect(closeFlow.stripChatEndTag(null)).toBe(null);
  });
});
