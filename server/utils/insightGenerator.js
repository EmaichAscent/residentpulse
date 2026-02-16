import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import { generateSummary } from "./summaryGenerator.js";

const anthropic = new Anthropic();
const MODEL = "claude-sonnet-4-5-20250929";

// Domain-specific stop words to exclude from word cloud
const STOP_WORDS = new Set([
  // English common
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall",
  "not", "no", "nor", "so", "if", "than", "that", "this", "these", "those", "it", "its",
  "i", "me", "my", "we", "us", "our", "you", "your", "he", "she", "they", "them", "their",
  "what", "which", "who", "whom", "when", "where", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "very", "just", "also", "about",
  "up", "out", "into", "over", "after", "before", "between", "under", "again", "then",
  "here", "there", "once", "during", "while", "too", "only", "own", "same", "as", "any",
  "well", "really", "much", "still", "even", "back", "get", "got", "go", "going", "went",
  "come", "came", "make", "made", "take", "took", "know", "think", "thing", "things",
  "said", "say", "like", "don", "doesn", "didn", "won", "wouldn", "couldn", "shouldn",
  "isn", "aren", "wasn", "weren", "hasn", "haven", "hadn", "let", "one", "two", "lot",
  "something", "anything", "everything", "nothing", "someone", "anyone", "everyone",
  "yeah", "yes", "okay", "sure", "right", "good", "great", "bad", "need", "want",
  "time", "way", "been", "because", "since", "through", "down", "around",
  // Domain-specific (too generic for property management context)
  "management", "board", "property", "community", "association", "hoa", "condo",
  "company", "manager", "member", "members", "resident", "residents", "building",
  "score", "nps", "survey", "interview", "feedback"
]);

/**
 * Generate AI insights for a concluded survey round.
 * Uses 3 parallel Sonnet passes + synthesis for consistency.
 */
export async function generateRoundInsights(roundId, clientId) {
  console.log(`Generating insights for round ${roundId}, client ${clientId}...`);

  // Auto-finalize abandoned sessions before generating insights
  await finalizeStaleSessionsForRound(roundId, clientId);

  // Fetch completed sessions with summaries for this round
  const sessions = await db.all(
    `SELECT s.id, s.email, s.nps_score, s.summary, s.community_name,
            u.first_name, u.last_name
     FROM sessions s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.round_id = ? AND s.client_id = ? AND s.completed = TRUE AND s.summary IS NOT NULL`,
    [roundId, clientId]
  );

  if (sessions.length === 0) {
    console.log(`No completed sessions for round ${roundId}, skipping insights`);
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

  // Build the shared context
  const sessionContext = sessions
    .map((s, i) => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email;
      return `Respondent ${i + 1} (${name}, ${s.community_name || "Unknown Community"}, NPS: ${s.nps_score}):
${s.summary}`;
    })
    .join("\n\n");

  const npsScores = sessions.filter((s) => s.nps_score != null).map((s) => s.nps_score);
  const avgNps = npsScores.length > 0
    ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1)
    : "N/A";
  const promoters = npsScores.filter((s) => s >= 9).length;
  const passives = npsScores.filter((s) => s >= 7 && s <= 8).length;
  const detractors = npsScores.filter((s) => s <= 6).length;
  const npsScore = npsScores.length > 0
    ? Math.round(((promoters - detractors) / npsScores.length) * 100)
    : "N/A";

  const baseContext = `Company: ${client?.company_name || "Unknown"}
${supplement?.value ? `Company Context: ${supplement.value}\n` : ""}Total Respondents: ${sessions.length}
NPS Score: ${npsScore} (Promoters: ${promoters}, Passives: ${passives}, Detractors: ${detractors})
Average NPS Rating: ${avgNps}
${prevRound?.insights_json ? `\nPrevious Round Context: Insights were generated previously. Build on trends, don't repeat.\n` : ""}
--- RESPONDENT SUMMARIES ---

${sessionContext}`;

  // Run 3 independent analysis passes in parallel
  const [findings, actions, callouts] = await Promise.all([
    runAnalysisPass(baseContext, "key_findings"),
    runAnalysisPass(baseContext, "recommended_actions"),
    runAnalysisPass(baseContext, "cam_ascent_callouts"),
  ]);

  // Synthesis pass: combine the 3 outputs into a coherent final result
  const synthesis = await runSynthesis(baseContext, findings, actions, callouts);

  // Store insights
  const insightsJson = {
    key_findings: synthesis.key_findings,
    recommended_actions: synthesis.recommended_actions,
    cam_ascent_callouts: synthesis.cam_ascent_callouts,
    executive_summary: synthesis.executive_summary,
    nps_score: npsScore,
    response_count: sessions.length,
    generated_at: new Date().toISOString(),
    passes: { findings, actions, callouts },
  };

  await db.run(
    "UPDATE survey_rounds SET insights_json = ?, insights_generated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [JSON.stringify(insightsJson), roundId]
  );

  // Generate word frequencies
  await generateWordFrequencies(roundId, clientId);

  console.log(`Insights generated for round ${roundId}`);
  return insightsJson;
}

/**
 * Run a single analysis pass focused on one aspect.
 */
async function runAnalysisPass(context, passType) {
  const prompts = {
    key_findings: `Analyze the survey responses below and identify the KEY FINDINGS — the most important themes, patterns, and insights from this round of board member feedback.

Return a JSON array of 3-6 findings, each with:
- "finding": A clear, specific statement of the finding
- "evidence": Brief supporting evidence from the responses
- "severity": "positive" | "neutral" | "concerning" | "critical"

Only output valid JSON array, no other text.

${context}`,

    recommended_actions: `Analyze the survey responses below and generate RECOMMENDED ACTIONS — specific, prioritized things the management company should consider implementing based on this feedback.

Return a JSON array of 3-6 actions, each with:
- "action": A specific, actionable recommendation
- "priority": "high" | "medium" | "low"
- "impact": Brief description of expected impact if implemented
- "rationale": Why this action matters based on the feedback

Only output valid JSON array, no other text.

${context}`,

    cam_ascent_callouts: `Analyze the survey responses below and identify areas where CAM Ascent (a property management consulting firm) could provide professional assistance. These should be items where expert consulting adds clear value beyond what the management company might do on their own.

Focus on: process improvement, board communication frameworks, financial management best practices, vendor management, compliance, strategic planning.

Return a JSON array of 1-4 callouts, each with:
- "area": The area of opportunity
- "opportunity": What the consulting engagement would address
- "suggested_service": A brief description of how CAM Ascent could help

Only output valid JSON array, no other text.

${context}`,
  };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompts[passType] }],
  });

  const text = response.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
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
1. "executive_summary": A 2-4 sentence narrative overview of what this round revealed
2. "key_findings": Array of the most important findings (deduplicated, refined). Each: {"finding", "evidence", "severity"}
3. "recommended_actions": Array of prioritized actions (deduplicated, refined). Each: {"action", "priority", "impact", "rationale"}
4. "cam_ascent_callouts": Array of consulting opportunities (deduplicated, refined). Each: {"area", "opportunity", "suggested_service"}

Deduplicate overlapping items. Prioritize clarity and actionability. Only output valid JSON, no other text.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return {
      executive_summary: "Insights could not be fully synthesized. Please regenerate.",
      key_findings: findings || [],
      recommended_actions: actions || [],
      cam_ascent_callouts: callouts || [],
    };
  }
}

/**
 * Generate word frequency data from board member messages in a round.
 */
export async function generateWordFrequencies(roundId, clientId) {
  const messages = await db.all(
    `SELECT m.content
     FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE s.round_id = ? AND s.client_id = ? AND m.role = 'user'`,
    [roundId, clientId]
  );

  if (messages.length === 0) return;

  const wordCounts = {};
  for (const msg of messages) {
    const words = msg.content
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  // Keep top 60 words
  const sorted = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([word, count]) => ({ word, count }));

  await db.run(
    "UPDATE survey_rounds SET word_frequencies = ? WHERE id = ?",
    [JSON.stringify(sorted), roundId]
  );

  return sorted;
}

/**
 * Compute word frequencies on-the-fly for an active round (not stored).
 */
export function computeLiveWordFrequencies(messages) {
  const wordCounts = {};
  for (const msg of messages) {
    const words = (msg.content || "")
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([word, count]) => ({ word, count }));
}

/**
 * Auto-finalize abandoned sessions for a round.
 * Criteria: has NPS score + at least 2 user messages + not completed.
 * Generates a summary and marks as complete.
 */
async function finalizeStaleSessionsForRound(roundId, clientId) {
  const staleSessions = await db.all(
    `SELECT s.id
     FROM sessions s
     WHERE s.round_id = ? AND s.client_id = ? AND s.completed = FALSE AND s.nps_score IS NOT NULL
       AND (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id AND m.role = 'user') >= 2`,
    [roundId, clientId]
  );

  if (staleSessions.length === 0) return;

  console.log(`Auto-finalizing ${staleSessions.length} abandoned session(s) for round ${roundId}`);

  for (const session of staleSessions) {
    try {
      await db.run("UPDATE sessions SET completed = TRUE WHERE id = ?", [session.id]);
      await generateSummary(session.id);
      console.log(`Auto-finalized session ${session.id}`);
    } catch (err) {
      console.error(`Failed to auto-finalize session ${session.id}:`, err.message);
    }
  }
}
