import db from "../db.js";
import { generateSummary } from "./summaryGenerator.js";
import logger from "./logger.js";
import { createMessage } from "./anthropicClient.js";
const MODEL = "claude-sonnet-4-5-20250929";

/** Resilient JSON parser — handles truncated or wrapped JSON from LLM responses */
function safeParseJSON(text, fallback) {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {}
  // Try extracting JSON object
  try {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
  } catch {}
  // Try extracting JSON array
  try {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]);
  } catch {}
  // Try fixing truncated JSON by closing open brackets
  try {
    let fixed = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const opens = (fixed.match(/\{/g) || []).length;
    const closes = (fixed.match(/\}/g) || []).length;
    for (let i = 0; i < opens - closes; i++) fixed += "}";
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += "]";
    return JSON.parse(fixed);
  } catch {}
  logger.warn(`Failed to parse JSON from LLM response (${text.length} chars)`);
  return fallback;
}
// CHUNK_MODEL retained as reference; not currently used (synthesis uses MODEL).
// eslint-disable-next-line no-unused-vars
const CHUNK_MODEL = "claude-haiku-4-5-20251001";

// Pure helpers extracted to wordFrequencies.js so they can be unit-tested
// without dragging in db.js's module-load side effects.
import { STOP_WORDS } from "./wordFrequencies.js";
export { computeLiveWordFrequencies } from "./wordFrequencies.js";

/**
 * Generate AI insights for a concluded survey round.
 * Uses 3 parallel Sonnet passes + synthesis for consistency.
 */
export async function generateRoundInsights(roundId, clientId) {
  logger.info(`Generating insights for round ${roundId}, client ${clientId}...`);

  // Fetch the round to determine its is_test value
  const round = await db.get("SELECT is_test FROM survey_rounds WHERE id = ?", [roundId]);
  const roundIsTest = round ? !!round.is_test : false;

  // Auto-finalize abandoned sessions before generating insights
  await finalizeStaleSessionsForRound(roundId, clientId);

  // Fetch completed sessions with summaries for this round, matching is_test
  const sessions = await db.all(
    `SELECT s.id, s.email, s.nps_score, s.summary,
            COALESCE(sc.community_name, s.community_name) as community_name,
            u.first_name, u.last_name
     FROM sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN communities sc ON sc.id = s.community_id
     WHERE s.round_id = ? AND s.client_id = ? AND s.completed = TRUE AND s.summary IS NOT NULL AND s.is_mock IS NOT TRUE
       AND COALESCE(s.is_test, FALSE) = ?`,
    [roundId, clientId, roundIsTest]
  );

  if (sessions.length === 0) {
    logger.info(`No completed sessions for round ${roundId}, skipping insights`);
    return;
  }

  // Get client context (from admin onboarding interview)
  const supplement = await db.get(
    "SELECT value FROM settings WHERE key = 'interview_prompt_supplement' AND client_id = ?",
    [clientId]
  );

  const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [clientId]);

  // Get previous round insights for continuity
  const prevRound = await db.get(
    `SELECT insights_json FROM survey_rounds
     WHERE client_id = ? AND id != ? AND insights_json IS NOT NULL
     ORDER BY concluded_at DESC LIMIT 1`,
    [clientId, roundId]
  );

  // Compute overall NPS stats (from ALL sessions, not just a sample)
  const npsScores = sessions.filter((s) => s.nps_score != null).map((s) => s.nps_score);
  const avgNps =
    npsScores.length > 0
      ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1)
      : "N/A";
  const promoters = npsScores.filter((s) => s >= 9).length;
  const passives = npsScores.filter((s) => s >= 7 && s <= 8).length;
  const detractors = npsScores.filter((s) => s <= 6).length;
  const npsScore =
    npsScores.length > 0 ? Math.round(((promoters - detractors) / npsScores.length) * 100) : "N/A";

  // Fetch critical alerts for this round (all statuses)
  const criticalAlerts = await db.all(
    `SELECT ca.alert_type, ca.severity, ca.description, ca.dismissed, COALESCE(ca.solved, FALSE) as solved,
            COALESCE(cm.community_name, u.community_name) as community_name,
            u.first_name, u.last_name
     FROM critical_alerts ca
     LEFT JOIN users u ON u.id = ca.user_id
     LEFT JOIN communities cm ON cm.id = u.community_id
     WHERE ca.round_id = ? AND ca.client_id = ?`,
    [roundId, clientId]
  );

  let alertContext = "";
  if (criticalAlerts.length > 0) {
    alertContext =
      "\n\n--- CRITICAL ALERTS FLAGGED DURING THIS ROUND ---\n\n" +
      criticalAlerts
        .map((a) => {
          const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "Unknown";
          const status = a.solved ? "solved" : a.dismissed ? "dismissed" : "active";
          return `- [${a.alert_type?.replace(/_/g, " ")}] from ${name} at ${a.community_name || "Unknown"}: ${a.description} (Status: ${status})`;
        })
        .join("\n");
  }

  const companyHeader = `Company: ${client?.company_name || "Unknown"}
${supplement?.value ? `Company Context: ${supplement.value}\n` : ""}Total Respondents: ${sessions.length}
NPS Score: ${npsScore} (Promoters: ${promoters}, Passives: ${passives}, Detractors: ${detractors})
Average NPS Rating: ${avgNps}
${prevRound?.insights_json ? `\nPrevious Round Context: Insights were generated previously. Build on trends, don't repeat.\n` : ""}`;

  // --- MAP-REDUCE APPROACH: analyze ALL sessions, not just a sample ---
  const CHUNK_SIZE = 150;
  const chunks = [];

  // Create balanced chunks with proportional NPS distribution
  const shuffled = [...sessions].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i += CHUNK_SIZE) {
    chunks.push(shuffled.slice(i, i + CHUNK_SIZE));
  }

  logger.info(`Insights: analyzing ${sessions.length} sessions in ${chunks.length} chunk(s)`);

  let chunkSummaries;
  let synthesis;

  if (chunks.length <= 1) {
    // Small round — single chunk, direct analysis (no map-reduce needed)
    const sessionContext = sessions
      .map((s, i) => {
        const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email;
        return `Respondent ${i + 1} (${name}, ${s.community_name || "Unknown Community"}, NPS: ${s.nps_score}):
${s.summary}`;
      })
      .join("\n\n");

    const baseContext = `${companyHeader}
--- RESPONDENT SUMMARIES ---

${sessionContext}${alertContext}`;

    // Run 3 independent analysis passes in parallel
    const [findings, actions, callouts] = await Promise.all([
      runAnalysisPass(baseContext, "key_findings"),
      runAnalysisPass(baseContext, "recommended_actions"),
      runAnalysisPass(baseContext, "cam_ascent_callouts"),
    ]);

    // Synthesis pass: combine the 3 outputs into a coherent final result
    chunkSummaries = null; // flag to skip map-reduce synthesis
    synthesis = await runSynthesis(baseContext, findings, actions, callouts);
  } else {
    // Large round — MAP phase: analyze each chunk in parallel
    const chunkFns = chunks.map((chunk, idx) => async () => {
      const chunkPromoters = chunk.filter((s) => s.nps_score >= 9).length;
      const chunkPassives = chunk.filter((s) => s.nps_score >= 7 && s.nps_score <= 8).length;
      const chunkDetractors = chunk.filter((s) => s.nps_score <= 6).length;

      const chunkContext = chunk
        .map((s, i) => {
          const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email;
          const trimmedSummary = (s.summary || "").slice(0, 200);
          return `Respondent ${i + 1} (${name}, ${s.community_name || "Unknown Community"}, NPS: ${s.nps_score}):
${trimmedSummary}`;
        })
        .join("\n\n");

      const prompt = `You are analyzing a batch of ${chunk.length} board member survey responses (batch ${idx + 1} of ${chunks.length}) for a community management company.

${companyHeader}
This batch: ${chunk.length} respondents (Promoters: ${chunkPromoters}, Passives: ${chunkPassives}, Detractors: ${chunkDetractors})

--- RESPONDENT SUMMARIES ---

${chunkContext}

Analyze ALL responses in this batch — both positive and negative. Identify:
1. What board members are HAPPY about (specific praise, things working well)
2. What board members are UNHAPPY about (complaints, concerns, frustrations)
3. Recurring themes or patterns across multiple respondents
4. Notable individual feedback that stands out
5. Manager-specific feedback (positive or negative)
6. Community-specific patterns

Return a JSON object with:
- "positive_themes": Array of {"theme", "evidence", "frequency"} — things going well
- "negative_themes": Array of {"theme", "evidence", "frequency"} — things needing attention
- "notable_feedback": Array of brief standout quotes or observations
- "community_patterns": Array of {"community", "sentiment", "key_issue"}

Only output valid JSON, no other text.`;

      const response = await createMessage({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].text.trim();
      return safeParseJSON(text, {
        positive_themes: [],
        negative_themes: [],
        notable_feedback: [],
        community_patterns: [],
      });
    });

    // Process chunks sequentially with delay to avoid rate limiting
    chunkSummaries = [];
    let failedChunks = 0;
    for (let ci = 0; ci < chunkFns.length; ci++) {
      if (ci > 0) await new Promise((r) => setTimeout(r, 2000)); // 2s delay between chunks
      try {
        const result = await chunkFns[ci]();
        chunkSummaries.push(result);
        logger.info(`Insights: chunk ${chunkSummaries.length}/${chunks.length} complete`);
      } catch (chunkErr) {
        failedChunks++;
        logger.error(
          `Insights: chunk ${chunkSummaries.length + 1} failed: ${chunkErr.message} (status: ${chunkErr.status || "unknown"})`
        );
        chunkSummaries.push({
          positive_themes: [],
          negative_themes: [],
          notable_feedback: [],
          community_patterns: [],
        });
      }
    }

    // If more than half the chunks failed, abort and save a failure record
    if (failedChunks > chunks.length / 2) {
      logger.error(`Insights: ${failedChunks}/${chunks.length} chunks failed, aborting`);
      const failedJson = {
        error: true,
        message: `Insight generation failed — ${failedChunks} of ${chunks.length} analysis batches could not be processed. Please try again.`,
        nps_score: npsScore,
        response_count: sessions.length,
        chunks_attempted: chunks.length,
        chunks_failed: failedChunks,
        generated_at: new Date().toISOString(),
      };
      await db.run(
        "UPDATE survey_rounds SET insights_json = ?, insights_generated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(failedJson), roundId]
      );
      return failedJson;
    }

    logger.info(
      `Insights: ${chunkSummaries.length} chunk analyses complete (${failedChunks} failed), running synthesis`
    );

    // REDUCE phase: synthesize all chunk analyses into final insights
    const synthesisContext = `${companyHeader}${alertContext}

--- CHUNK ANALYSIS RESULTS (${chunkSummaries.length} batches covering all ${sessions.length} respondents) ---

${chunkSummaries
  .map(
    (cs, i) => `BATCH ${i + 1}:
Positive Themes: ${JSON.stringify(cs.positive_themes || [])}
Negative Themes: ${JSON.stringify(cs.negative_themes || [])}
Notable Feedback: ${JSON.stringify(cs.notable_feedback || [])}
Community Patterns: ${JSON.stringify(cs.community_patterns || [])}`
  )
  .join("\n\n")}`;

    // Run the 4 analysis passes on the combined chunk summaries.
    // topic_themes is a separate pass (rather than rolled into synthesis)
    // because its output schema is fundamentally different — it's
    // weighted topic frequencies for the dashboard's "What boards are
    // talking about" section, not narrative findings.
    const [findings, actions, callouts, themes] = await Promise.all([
      runAnalysisPass(synthesisContext, "key_findings"),
      runAnalysisPass(synthesisContext, "recommended_actions"),
      runAnalysisPass(synthesisContext, "cam_ascent_callouts"),
      runAnalysisPass(synthesisContext, "topic_themes"),
    ]);

    // Final synthesis
    synthesis = await runSynthesis(synthesisContext, findings, actions, callouts);
    // topic_themes isn't part of synthesis — it's a structured side
    // output. Stash it onto the synthesis for the storage step below.
    synthesis.promoter_themes = themes?.promoter_themes || [];
    synthesis.detractor_themes = themes?.detractor_themes || [];
  }

  // Store insights
  const insightsJson = {
    key_findings: synthesis.key_findings,
    recommended_actions: synthesis.recommended_actions,
    cam_ascent_callouts: synthesis.cam_ascent_callouts,
    executive_summary: synthesis.executive_summary,
    promoter_themes: synthesis.promoter_themes || [],
    detractor_themes: synthesis.detractor_themes || [],
    nps_score: npsScore,
    response_count: sessions.length,
    chunks_analyzed: chunks.length,
    generated_at: new Date().toISOString(),
  };

  await db.run(
    "UPDATE survey_rounds SET insights_json = ?, insights_generated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [JSON.stringify(insightsJson), roundId]
  );

  // Generate word frequencies
  await generateWordFrequencies(roundId, clientId);

  logger.info(`Insights generated for round ${roundId}`);
  return insightsJson;
}

/**
 * Run a single analysis pass focused on one aspect.
 */
async function runAnalysisPass(context, passType) {
  const prompts = {
    key_findings: `Analyze the survey responses below and identify the KEY FINDINGS — the most important themes, patterns, and insights from this round of board member feedback.

IMPORTANT: Include a balanced view. At least 1-2 findings MUST be positive — things the company is doing well that board members praised. Leaders need to know what's working so they can protect and build on it, not just what's broken. Keep findings to 4-5 total — tight and high-impact.

Return a JSON array of 4-5 findings, each with:
- "finding": A clear, specific statement of the finding
- "evidence": Brief supporting evidence from the responses
- "severity": "positive" | "neutral" | "concerning" | "critical"

Only output valid JSON array, no other text.

${context}`,

    recommended_actions: `Analyze the survey responses below and generate RECOMMENDED ACTIONS — specific, prioritized things the management company should consider implementing based on this feedback.

IMPORTANT: A management company can realistically implement 1-3 changes per quarter. Keep recommendations to 3 maximum — the highest-impact actions only. Make them specific enough to act on immediately. Also include 1 "keep doing" recommendation that reinforces something board members praised.

Return a JSON array of 3 actions, each with:
- "action": A specific, actionable recommendation
- "priority": "high" | "medium" | "low" | "keep_doing"
- "impact": Brief description of expected impact if implemented
- "rationale": Why this action matters based on the feedback

Only output valid JSON array, no other text.

${context}`,

    cam_ascent_callouts: `Analyze the survey responses below and identify areas where CAM Ascent (a property management consulting firm) could provide professional assistance. These should be items where expert consulting adds clear value beyond what the management company might do on their own.

Focus on: process improvement, board communication frameworks, financial management best practices, vendor management, compliance, strategic planning.

Return a JSON array of 1-2 callouts (keep it focused), each with:
- "area": The area of opportunity
- "opportunity": What the consulting engagement would address
- "suggested_service": A brief description of how CAM Ascent could help

Only output valid JSON array, no other text.

${context}`,

    topic_themes: `Analyze the chunk-level theme summaries below and produce two ranked lists of TOPICS that distinguish promoters from detractors. These power the "What boards are talking about" visualization on the round dashboard — bar chart with weighted bars, plus an expandable detail panel per row.

Look across all batches. The "positive_themes" lists in each batch are what promoters/passives praised. The "negative_themes" lists are what detractors/passives complained about. Aggregate by topic, count frequency, and produce a single ranked list for each side.

CRITICAL — theme labels must be SHORT:
  • 1 word ideal, 2 words acceptable, 3 words MAX.
  • Hard cap: 25 characters.
  • GOOD examples: "responsive", "communication", "vendors", "fees", "slow response", "manager turnover", "budget process".
  • BAD examples (DO NOT do this): "Strong individual managers" (4 words), "Community manager turnover" (3 words but 26+ chars), "Systemic budget process issues" (full phrase), "Communication breakdown patterns" (paraphrase).
  • Picture it as a column header in a table — if it doesn't fit, it's too long.

If you find yourself wanting a longer phrase, split it into two themes (e.g. "manager turnover" + "continuity") rather than concatenating. The detail panel below each row is where nuance lives, not the label.

Return a JSON object with this exact shape:
{
  "promoter_themes": [
    {
      "theme": "responsive",
      "weight": 95,
      "evidence": "47 promoter sessions cited fast manager response times across 12 communities. Most-cited example: emergency maintenance dispatched within hours.",
      "sample_quote": "Our manager Sarah is the most responsive person I've ever worked with — same day, every time.",
      "sample_attribution": "Aspen Park board, NPS 9"
    }
  ],
  "detractor_themes": [
    {
      "theme": "slow response",
      "weight": 92,
      "evidence": "28 detractor sessions complained about days-long delays on routine maintenance and communication.",
      "sample_quote": "We've had three pool issues this year and the response is always 'we'll look into it.' Then nothing happens.",
      "sample_attribution": "Crystal Heights board, NPS 1"
    }
  ]
}

Rules:
- Provide 5-8 themes per side (whichever side has more signal — if there's not enough material for 5 detractor themes, fewer is fine).
- weight is 0-100. The HIGHEST-frequency theme on each side gets the highest weight (90-100). Subsequent themes scale down by relative frequency. This drives the bar fill widths on the dashboard.
- evidence is a 1-2 sentence summary of WHY this theme ranks where it does — quantify if possible (e.g. "47 sessions across 12 communities") and reference the specific behavior. This shows in the row's expanded detail panel.
- sample_quote is a SHORT (under 30 words) verbatim or near-verbatim quote pulled from the notable_feedback or evidence in the chunk summaries. Avoid composite paraphrasing — pick the strongest single quote.
- sample_attribution: format as "{community name} board, NPS {score}" if you have it, or just "Anonymous, NPS {score}" if not. Pick the source for the sample_quote.
- Sort each list by weight descending.
- Only output valid JSON object, no preamble.

${context}`,
  };

  // topic_themes returns an object, not an array — use the right default.
  const fallback = passType === "topic_themes" ? { promoter_themes: [], detractor_themes: [] } : [];

  const response = await createMessage({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompts[passType] }],
  });

  const text = response.content[0].text.trim();
  return safeParseJSON(text, fallback);
}

/**
 * Synthesis pass: combine 3 independent analyses into a final authoritative result.
 */
async function runSynthesis(context, findings, actions, callouts) {
  const prompt = `You are producing the FINAL synthesis of a survey round analysis for a property management company. Three independent analyses were run. Combine them into a single, authoritative output.

INDEPENDENT ANALYSIS RESULTS:
Key Findings: ${JSON.stringify(findings)}
Recommended Actions: ${JSON.stringify(actions)}
CAM Ascent Callouts: ${JSON.stringify(callouts)}

ORIGINAL CONTEXT:
${context}

Produce a final JSON object with these fields:
1. "executive_summary": A 2-4 sentence narrative overview. Lead with something positive, then address the key concern, then the path forward. This sets the tone — balanced, not doom-and-gloom.
2. "key_findings": 4-5 findings max (deduplicated, refined). At least 1-2 MUST be positive. Each: {"finding", "evidence", "severity"}
3. "recommended_actions": 3 actions max (the company can only implement 1-3 changes per quarter). Include 1 "keep_doing" action. Each: {"action", "priority", "impact", "rationale"}
4. "cam_ascent_callouts": 1-2 focused callouts (deduplicated, refined). Each: {"area", "opportunity", "suggested_service"}

Deduplicate overlapping items. Be tight and high-impact — less is more. Only output valid JSON, no other text.`;

  const response = await createMessage({
    model: MODEL,
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  return safeParseJSON(text, {
    executive_summary: "Insights could not be fully synthesized. Please regenerate.",
    key_findings: findings || [],
    recommended_actions: actions || [],
    cam_ascent_callouts: callouts || [],
  });
}

/**
 * Generate word frequency data from board member messages in a round.
 */
export async function generateWordFrequencies(roundId, clientId) {
  // Fetch the round to determine its is_test value
  const round = await db.get("SELECT is_test FROM survey_rounds WHERE id = ?", [roundId]);
  const roundIsTest = round ? !!round.is_test : false;

  // Use streaming approach — fetch only content column, process in chunks
  const messages = await db.all(
    `SELECT m.content
     FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE s.round_id = ? AND s.client_id = ? AND s.is_mock IS NOT TRUE AND m.role = 'user'
       AND COALESCE(s.is_test, FALSE) = ?`,
    [roundId, clientId, roundIsTest]
  );

  if (messages.length === 0) return;

  const wordCounts = {};
  // Process in chunks of 500 to limit peak memory
  for (let i = 0; i < messages.length; i += 500) {
    const chunk = messages.slice(i, i + 500);
    for (const msg of chunk) {
      const words = msg.content
        .toLowerCase()
        .replace(/[^a-z\s'-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

      for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
  }

  // Filter out single mentions (not a trend) and keep top 40 words
  const sorted = Object.entries(wordCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([word, count]) => ({ word, count }));

  await db.run("UPDATE survey_rounds SET word_frequencies = ? WHERE id = ?", [
    JSON.stringify(sorted),
    roundId,
  ]);

  return sorted;
}

/**
 * Auto-finalize abandoned sessions for a round.
 * Criteria: has NPS score + not completed. The NPS itself is the primary signal,
 * so we include it in round results even when the resident didn't add comments.
 * Generates a summary if there's a transcript; otherwise leaves summary null.
 */
async function finalizeStaleSessionsForRound(roundId, clientId) {
  const staleSessions = await db.all(
    `SELECT s.id
     FROM sessions s
     WHERE s.round_id = ? AND s.client_id = ? AND s.completed = FALSE AND s.nps_score IS NOT NULL AND s.is_mock IS NOT TRUE`,
    [roundId, clientId]
  );

  if (staleSessions.length === 0) return;

  logger.info(`Auto-finalizing ${staleSessions.length} abandoned session(s) for round ${roundId}`);

  for (const session of staleSessions) {
    try {
      await db.run("UPDATE sessions SET completed = TRUE WHERE id = ?", [session.id]);
      await generateSummary(session.id);
      logger.info(`Auto-finalized session ${session.id}`);
    } catch (err) {
      logger.error(`Failed to auto-finalize session ${session.id}: %s`, err.message);
    }
  }
}
