import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = Router();
const anthropic = new Anthropic();

// Require authentication for insights
router.use(requireClientAdmin);

router.post("/", async (req, res) => {
  const { session_ids } = req.body;

  if (!session_ids || !Array.isArray(session_ids) || session_ids.length === 0) {
    return res.status(400).json({ error: "session_ids array is required" });
  }

  // Get summaries for all the sessions (filtered by client)
  const placeholders = session_ids.map(() => "?").join(",");
  const sessions = await db.all(
    `SELECT s.id, s.email, s.nps_score, s.summary,
            COALESCE(sc.community_name, s.community_name) as community_name,
            s.management_company
     FROM sessions s
     LEFT JOIN communities sc ON sc.id = s.community_id
     WHERE s.id IN (${placeholders}) AND s.summary IS NOT NULL AND s.client_id = ?`,
    [...session_ids, req.clientId]
  );

  if (sessions.length === 0) {
    return res.status(400).json({ error: "No sessions with summaries found" });
  }

  // Build context for Claude
  const context = sessions
    .map((s, i) => {
      return `Response ${i + 1}:
- Email: ${s.email}
- NPS Score: ${s.nps_score}
- Community: ${s.community_name || "N/A"}
- Company: ${s.management_company || "N/A"}
- Summary: ${s.summary}`;
    })
    .join("\n\n");

  const avgNps = (sessions.reduce((sum, s) => sum + s.nps_score, 0) / sessions.length).toFixed(1);

  const prompt = `You are analyzing resident feedback for a property management company. Below are ${sessions.length} survey responses that make up the current NPS calculation (average NPS: ${avgNps}).

${context}

Based on these responses, provide:
1. A brief overall summary (2-3 sentences) of the key themes
2. A prioritized list of 3-5 actionable insights that management should address

Format your response as:
**Summary:**
[Your summary here]

**Actionable Insights:**
1. [First insight]
2. [Second insight]
3. [Third insight]
etc.

Focus on concrete, specific actions that can improve resident satisfaction.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const insights = response.content[0].text;
    res.json({ insights, session_count: sessions.length });
  } catch (err) {
    logger.error("Anthropic API error: %s", err.message);
    res.status(500).json({ error: "Failed to generate insights" });
  }
});

export default router;
