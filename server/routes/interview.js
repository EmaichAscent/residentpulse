import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { logActivity } from "../utils/activityLog.js";
import logger from "../utils/logger.js";

const router = Router();
const anthropic = new Anthropic();

router.use(requireClientAdmin);

// Load interview prompts from DB (seeded on startup in db.js, editable via SuperAdmin Settings)
async function getInterviewPrompt(key, fallback) {
  const row = await db.get("SELECT value FROM settings WHERE key = ? AND client_id IS NULL", [key]);
  return row?.value || fallback;
}

const getInitialPrompt = () => getInterviewPrompt("interview_initial_prompt", "You are a professional onboarding specialist.");
const getReInterviewPrompt = () => getInterviewPrompt("interview_re_prompt", "You are conducting a check-in interview.");
const getPromptGenerationInstruction = () => getInterviewPrompt("prompt_generation_instruction", "Generate a prompt supplement.");

// Get interview status for the current admin
router.get("/status", async (req, res) => {
  try {
    const completedInterview = await db.get(
      "SELECT id, completed_at, interview_summary FROM admin_interviews WHERE client_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
      [req.clientId]
    );

    const activeInterview = await db.get(
      "SELECT id FROM admin_interviews WHERE client_id = ? AND admin_id = ? AND status = 'in_progress' LIMIT 1",
      [req.clientId, req.userId]
    );

    const admin = await db.get(
      "SELECT onboarding_completed FROM client_admins WHERE id = ?",
      [req.userId]
    );

    res.json({
      hasCompletedInterview: !!completedInterview,
      lastInterviewDate: completedInterview?.completed_at || null,
      interviewSummary: completedInterview?.interview_summary || null,
      activeInterviewId: activeInterview?.id || null,
      onboardingCompleted: admin?.onboarding_completed || false
    });
  } catch (err) {
    logger.error({ err }, "Error getting interview status");
    res.status(500).json({ error: "Failed to get interview status" });
  }
});

// Get a specific interview with messages
router.get("/:id", async (req, res) => {
  try {
    const interview = await db.get(
      "SELECT * FROM admin_interviews WHERE id = ? AND client_id = ?",
      [Number(req.params.id), req.clientId]
    );

    if (!interview) {
      return res.status(404).json({ error: "Interview not found" });
    }

    const messages = await db.all(
      "SELECT id, role, content, created_at FROM admin_interview_messages WHERE interview_id = ? ORDER BY created_at",
      [interview.id]
    );

    res.json({ interview, messages });
  } catch (err) {
    logger.error({ err }, "Error getting interview");
    res.status(500).json({ error: "Failed to get interview" });
  }
});

// Create a new interview
router.post("/", async (req, res) => {
  try {
    const { interview_type } = req.body;
    const type = interview_type === "re_interview" ? "re_interview" : "initial";

    // Check for existing in-progress interview
    const existing = await db.get(
      "SELECT id FROM admin_interviews WHERE client_id = ? AND admin_id = ? AND status = 'in_progress'",
      [req.clientId, req.userId]
    );

    if (existing) {
      return res.json({ interview_id: existing.id, resumed: true });
    }

    // Get previous completed interview for re-interviews
    let previousInterviewId = null;
    if (type === "re_interview") {
      const prev = await db.get(
        "SELECT id FROM admin_interviews WHERE client_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
        [req.clientId]
      );
      previousInterviewId = prev?.id || null;
    }

    const result = await db.run(
      "INSERT INTO admin_interviews (client_id, admin_id, interview_type, previous_interview_id) VALUES (?, ?, ?, ?)",
      [req.clientId, req.userId, type, previousInterviewId]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "start_interview",
      entityType: "interview",
      entityId: result.lastInsertRowid,
      clientId: req.clientId,
      metadata: { interview_type: type }
    });

    res.json({ interview_id: result.lastInsertRowid, resumed: false });
  } catch (err) {
    logger.error({ err }, "Error creating interview");
    res.status(500).json({ error: "Failed to create interview" });
  }
});

// Save structured fields and get first AI message
router.post("/:id/structured", async (req, res) => {
  try {
    const interviewId = Number(req.params.id);
    const { company_size, years_in_business, geographic_area, communities_managed, competitive_advantages } = req.body;

    const interview = await db.get(
      "SELECT * FROM admin_interviews WHERE id = ? AND client_id = ? AND status = 'in_progress'",
      [interviewId, req.clientId]
    );

    if (!interview) {
      return res.status(404).json({ error: "Interview not found or already completed" });
    }

    // Save structured fields
    await db.run(
      `UPDATE admin_interviews SET company_size = ?, years_in_business = ?, geographic_area = ?,
       communities_managed = ?, competitive_advantages = ? WHERE id = ?`,
      [company_size || null, years_in_business || null, geographic_area || null,
       communities_managed || null, competitive_advantages || null, interviewId]
    );

    // Build context for the AI
    let contextIntro = `The admin has provided the following about their company:\n`;
    contextIntro += `- Admin email: ${req.userEmail}\n`;
    if (req.session?.user?.company_name) contextIntro += `- Company name: ${req.session.user.company_name}\n`;
    if (company_size) contextIntro += `- Company size: ${company_size}\n`;
    if (years_in_business) contextIntro += `- Years in business: ${years_in_business}\n`;
    if (geographic_area) contextIntro += `- Geographic area: ${geographic_area}\n`;
    if (communities_managed) contextIntro += `- Communities managed: ${communities_managed}\n`;
    if (competitive_advantages) contextIntro += `- Competitive advantages: ${competitive_advantages}\n`;

    let systemPrompt = await getInitialPrompt();

    // For re-interviews, include previous context
    if (interview.interview_type === "re_interview" && interview.previous_interview_id) {
      systemPrompt = await getReInterviewPrompt();

      const prevInterview = await db.get(
        "SELECT generated_prompt, interview_summary FROM admin_interviews WHERE id = ?",
        [interview.previous_interview_id]
      );

      const prevMessages = await db.all(
        "SELECT role, content FROM admin_interview_messages WHERE interview_id = ? ORDER BY created_at",
        [interview.previous_interview_id]
      );

      if (prevInterview) {
        systemPrompt += `\n\nPREVIOUS INTERVIEW CONTEXT:\n`;
        if (prevInterview.interview_summary) {
          systemPrompt += `Summary: ${prevInterview.interview_summary}\n`;
        }
        if (prevInterview.generated_prompt) {
          systemPrompt += `Generated prompt from last time: ${prevInterview.generated_prompt}\n`;
        }
        if (prevMessages.length > 0) {
          systemPrompt += `\nPrevious transcript:\n`;
          for (const msg of prevMessages) {
            systemPrompt += `${msg.role === "user" ? "Admin" : "Interviewer"}: ${msg.content}\n`;
          }
        }
      }
    }

    systemPrompt += `\n\nCURRENT STRUCTURED DATA:\n${contextIntro}`;

    // Generate first AI message
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: "I've filled in the form above. Let's start the interview." }],
    });

    const aiMessage = response.content[0].text;

    // Save messages
    await db.run(
      "INSERT INTO admin_interview_messages (interview_id, role, content) VALUES (?, 'user', ?)",
      [interviewId, "[Structured fields submitted]"]
    );
    await db.run(
      "INSERT INTO admin_interview_messages (interview_id, role, content) VALUES (?, 'assistant', ?)",
      [interviewId, aiMessage]
    );

    res.json({ message: aiMessage });
  } catch (err) {
    logger.error({ err }, "Error processing structured fields");
    res.status(500).json({ error: "Failed to process structured fields" });
  }
});

// Send a chat message during interview
router.post("/:id/message", async (req, res) => {
  try {
    const interviewId = Number(req.params.id);
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const interview = await db.get(
      "SELECT * FROM admin_interviews WHERE id = ? AND client_id = ? AND status = 'in_progress'",
      [interviewId, req.clientId]
    );

    if (!interview) {
      return res.status(404).json({ error: "Interview not found or already completed" });
    }

    // Save user message
    await db.run(
      "INSERT INTO admin_interview_messages (interview_id, role, content) VALUES (?, 'user', ?)",
      [interviewId, message]
    );

    // Get conversation history
    const history = await db.all(
      "SELECT role, content FROM admin_interview_messages WHERE interview_id = ? ORDER BY created_at",
      [interviewId]
    );

    // Build system prompt with context
    let systemPrompt = interview.interview_type === "re_interview"
      ? await getReInterviewPrompt()
      : await getInitialPrompt();

    // Add structured data context
    let contextIntro = `\n\nCURRENT STRUCTURED DATA:\n`;
    contextIntro += `- Admin email: ${req.userEmail}\n`;
    if (req.session?.user?.company_name) contextIntro += `- Company name: ${req.session.user.company_name}\n`;
    if (interview.company_size) contextIntro += `- Company size: ${interview.company_size}\n`;
    if (interview.years_in_business) contextIntro += `- Years in business: ${interview.years_in_business}\n`;
    if (interview.geographic_area) contextIntro += `- Geographic area: ${interview.geographic_area}\n`;
    if (interview.communities_managed) contextIntro += `- Communities managed: ${interview.communities_managed}\n`;
    if (interview.competitive_advantages) contextIntro += `- Competitive advantages: ${interview.competitive_advantages}\n`;
    systemPrompt += contextIntro;

    // For re-interviews, include previous context
    if (interview.interview_type === "re_interview" && interview.previous_interview_id) {
      const prevInterview = await db.get(
        "SELECT generated_prompt, interview_summary FROM admin_interviews WHERE id = ?",
        [interview.previous_interview_id]
      );

      if (prevInterview) {
        systemPrompt += `\nPREVIOUS INTERVIEW CONTEXT:\n`;
        if (prevInterview.interview_summary) {
          systemPrompt += `Summary: ${prevInterview.interview_summary}\n`;
        }
        if (prevInterview.generated_prompt) {
          systemPrompt += `Generated prompt from last time: ${prevInterview.generated_prompt}\n`;
        }
      }
    }

    // Get AI response
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 400,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const aiMessage = response.content[0].text;

    // Save assistant message
    await db.run(
      "INSERT INTO admin_interview_messages (interview_id, role, content) VALUES (?, 'assistant', ?)",
      [interviewId, aiMessage]
    );

    res.json({ message: aiMessage });
  } catch (err) {
    logger.error({ err }, "Error in interview chat");
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

// Admin confirms summary — triggers prompt generation
router.patch("/:id/confirm", async (req, res) => {
  try {
    const interviewId = Number(req.params.id);

    const interview = await db.get(
      "SELECT * FROM admin_interviews WHERE id = ? AND client_id = ? AND status = 'in_progress'",
      [interviewId, req.clientId]
    );

    if (!interview) {
      return res.status(404).json({ error: "Interview not found or already completed" });
    }

    // Get full transcript
    const messages = await db.all(
      "SELECT role, content FROM admin_interview_messages WHERE interview_id = ? ORDER BY created_at",
      [interviewId]
    );

    const transcript = messages
      .map((m) => `${m.role === "user" ? "Admin" : "Interviewer"}: ${m.content}`)
      .join("\n\n");

    // Build context for prompt generation
    let structuredContext = "";
    if (interview.company_size) structuredContext += `Company size: ${interview.company_size}\n`;
    if (interview.years_in_business) structuredContext += `Years in business: ${interview.years_in_business}\n`;
    if (interview.geographic_area) structuredContext += `Geographic area: ${interview.geographic_area}\n`;
    if (interview.communities_managed) structuredContext += `Communities managed: ${interview.communities_managed}\n`;
    if (interview.competitive_advantages) structuredContext += `Competitive advantages: ${interview.competitive_advantages}\n`;

    // Generate prompt supplement
    const promptResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      system: await getPromptGenerationInstruction(),
      messages: [{
        role: "user",
        content: `STRUCTURED DATA:\n${structuredContext}\n\nINTERVIEW TRANSCRIPT:\n${transcript}`
      }],
    });

    const generatedPrompt = promptResponse.content[0].text;

    // Generate a brief summary
    const summaryResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      system: "Summarize this interview in 2-3 sentences capturing the key takeaways. Output only the summary text.",
      messages: [{
        role: "user",
        content: `STRUCTURED DATA:\n${structuredContext}\n\nINTERVIEW TRANSCRIPT:\n${transcript}`
      }],
    });

    const interviewSummary = summaryResponse.content[0].text;

    // Update interview record
    await db.run(
      `UPDATE admin_interviews SET status = 'completed', generated_prompt = ?, interview_summary = ?,
       admin_confirmed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [generatedPrompt, interviewSummary, interviewId]
    );

    // Upsert the prompt supplement into settings
    const existing = await db.get(
      "SELECT id FROM settings WHERE key = 'interview_prompt_supplement' AND client_id = ?",
      [req.clientId]
    );

    if (existing) {
      await db.run(
        "UPDATE settings SET value = ? WHERE key = 'interview_prompt_supplement' AND client_id = ?",
        [generatedPrompt, req.clientId]
      );
    } else {
      await db.run(
        "INSERT INTO settings (key, value, client_id) VALUES ('interview_prompt_supplement', ?, ?)",
        [generatedPrompt, req.clientId]
      );
    }

    // Mark onboarding as completed (DB + session)
    await db.run(
      "UPDATE client_admins SET onboarding_completed = TRUE WHERE id = ?",
      [req.userId]
    );
    if (req.session?.user) {
      req.session.user.onboarding_completed = true;
    }

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "complete_interview",
      entityType: "interview",
      entityId: interviewId,
      clientId: req.clientId,
      metadata: { interview_type: interview.interview_type }
    });

    res.json({
      ok: true,
      summary: interviewSummary,
      generated_prompt: generatedPrompt
    });
  } catch (err) {
    logger.error({ err }, "Error confirming interview");
    res.status(500).json({ error: "Failed to confirm interview" });
  }
});

// Abandon interview ("Do this later")
router.patch("/:id/abandon", async (req, res) => {
  try {
    const interviewId = Number(req.params.id);

    const interview = await db.get(
      "SELECT id FROM admin_interviews WHERE id = ? AND client_id = ? AND status = 'in_progress'",
      [interviewId, req.clientId]
    );

    if (!interview) {
      return res.status(404).json({ error: "Interview not found or already completed" });
    }

    await db.run(
      "UPDATE admin_interviews SET status = 'abandoned' WHERE id = ?",
      [interviewId]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "abandon_interview",
      entityType: "interview",
      entityId: interviewId,
      clientId: req.clientId
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error abandoning interview");
    res.status(500).json({ error: "Failed to abandon interview" });
  }
});

export default router;
