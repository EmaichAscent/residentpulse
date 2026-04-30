/**
 * Build the personalized welcome message shown above the resident chat,
 * before the AI takes over.
 *
 * V2 voice rules (mirrors the V2 board-interview system prompt):
 *   - Warm but direct. No "we're collecting feedback" corporate framing.
 *   - Do NOT prompt the resident to use the End Chat button. The V2
 *     system prompt explicitly forbids the AI from doing so; the welcome
 *     should match.
 *   - Optional voice hints are appended only when the browser supports
 *     speech synthesis or recognition.
 */
export function buildWelcomeMessage({
  firstName,
  company,
  community,
  hasSynth,
  hasSpeechRecognition,
}) {
  const userName = firstName || "there";
  const companyText = company ? ` on behalf of ${company}` : "";
  const roleText = community ? ` as a board member at ${community}` : " as a board member";

  const voiceHints = [];
  if (hasSynth) {
    voiceHints.push("click the speaker button to hear responses read aloud");
  }
  if (hasSpeechRecognition) {
    voiceHints.push(
      "click the microphone button to speak your responses (your browser will ask for permission the first time)"
    );
  }
  const voiceText =
    voiceHints.length > 0 ? ` You can type your responses, or ${voiceHints.join(", and ")}.` : "";

  return `Hi ${userName} — quick read on how things are going${companyText} for you${roleText}.${voiceText} Let's start with a quick rating.`;
}
