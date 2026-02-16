import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";

const anthropic = new Anthropic();

/**
 * Generate an AI summary for a session from its messages.
 * Used both by the normal "End Chat" flow and admin "Finalize" flow.
 */
export async function generateSummary(sessionId) {
  const allMessages = await db.all(
    "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    [sessionId]
  );
  const session = await db.get("SELECT nps_score FROM sessions WHERE id = ?", [sessionId]);

  if (allMessages.length === 0) return null;

  const transcript = allMessages
    .map((m) => `${m.role === "user" ? "Resident" : "Interviewer"}: ${m.content}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    system:
      "You are an analyst summarizing resident feedback for a property management company. Write a concise summary (3-5 sentences) highlighting the key themes, concerns, and actionable insights from this NPS interview. Focus on what matters most to management.",
    messages: [
      {
        role: "user",
        content: `NPS Score: ${session?.nps_score ?? "N/A"}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  const summary = response.content[0].text;
  await db.run("UPDATE sessions SET summary = ? WHERE id = ?", [summary, sessionId]);
  return summary;
}
