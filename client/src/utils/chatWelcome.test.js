import { describe, it, expect } from "vitest";
import { buildWelcomeMessage } from "./chatWelcome";

describe("buildWelcomeMessage", () => {
  it("personalizes by first name and includes the company", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Zee Best Management",
      community: "Riverwalk Cove",
      hasSynth: false,
      hasSpeechRecognition: false,
    });
    expect(msg).toMatch(/^Hi Amy/);
    expect(msg).toMatch(/on behalf of Zee Best Management/);
    expect(msg).toMatch(/as a board member at Riverwalk Cove/);
  });

  it("falls back to 'there' when first name is missing", () => {
    const msg = buildWelcomeMessage({
      firstName: "",
      company: "Acme",
      community: "Some Place",
    });
    expect(msg).toMatch(/^Hi there/);
  });

  it("omits the 'on behalf of' phrase when company is empty", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "",
      community: "Riverwalk Cove",
    });
    expect(msg).not.toMatch(/on behalf of/);
  });

  it("falls back to a generic 'as a board member' when community is missing", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "",
    });
    expect(msg).toMatch(/as a board member\./);
    expect(msg).not.toMatch(/at\s+\./);
  });

  it("appends speaker hint only when speech synthesis is supported", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "Cove",
      hasSynth: true,
      hasSpeechRecognition: false,
    });
    expect(msg).toMatch(/click the speaker button/);
    expect(msg).not.toMatch(/click the microphone button/);
  });

  it("appends mic hint only when speech recognition is supported", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "Cove",
      hasSynth: false,
      hasSpeechRecognition: true,
    });
    expect(msg).toMatch(/click the microphone button/);
    expect(msg).not.toMatch(/click the speaker button/);
  });

  it("appends both voice hints with 'and' when both APIs are available", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "Cove",
      hasSynth: true,
      hasSpeechRecognition: true,
    });
    expect(msg).toMatch(/speaker button.*and.*microphone button/);
  });

  it("does NOT prompt the user to use the End Chat button (V2 rule)", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "Cove",
      hasSynth: true,
      hasSpeechRecognition: true,
    });
    expect(msg).not.toMatch(/End Chat/i);
    expect(msg).not.toMatch(/click "End Chat"/i);
  });

  it("does NOT use the old 'we're collecting feedback' framing", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "Cove",
    });
    expect(msg).not.toMatch(/We're collecting feedback/i);
  });

  it("ends with the rating-prompt sentence (so the NPS scale appears next)", () => {
    const msg = buildWelcomeMessage({
      firstName: "Amy",
      company: "Acme",
      community: "Cove",
    });
    expect(msg).toMatch(/Let's start with a quick rating\.$/);
  });
});
