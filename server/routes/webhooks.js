import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { notifyBouncedInvitation } from "../utils/emailService.js";
import logger from "../utils/logger.js";

const router = Router();

/**
 * Verify Resend webhook signature (Svix format).
 * Returns true if valid or if no secret is configured (graceful degradation).
 */
function verifyWebhookSignature(req) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if secret not configured

  const svixId = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject if timestamp is more than 5 minutes old (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(svixTimestamp)) > 300) return false;

  // Decode secret (strip "whsec_" prefix, base64-decode)
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");

  // Sign: "{svix-id}.{svix-timestamp}.{raw body}"
  const toSign = `${svixId}.${svixTimestamp}.${req.rawBody || JSON.stringify(req.body)}`;
  const computed = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

  // Svix may send multiple signatures space-separated, each prefixed with "v1,"
  const candidates = svixSignature.split(" ").map(s => s.replace(/^v1,/, ""));
  return candidates.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

/**
 * Resend webhook endpoint — receives email delivery events.
 * Events: email.sent, email.delivered, email.bounced, email.complained, email.delivery_delayed
 *
 * Configure in Resend dashboard:
 *   URL: https://residentpulse-production.up.railway.app/api/webhooks/resend
 *   Events: email.delivered, email.bounced, email.complained
 *
 * Set RESEND_WEBHOOK_SECRET env var for signature verification.
 */
router.post("/resend", async (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      logger.warn("Webhook signature verification failed");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { type, data } = req.body;

    if (!type || !data) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const emailId = data.email_id;
    if (!emailId) {
      // Some events may not have email_id — acknowledge and skip
      return res.json({ received: true });
    }

    // Map Resend event types to our delivery statuses
    let deliveryStatus;
    let bounceType = null;

    switch (type) {
      case "email.delivered":
        deliveryStatus = "delivered";
        break;
      case "email.bounced":
        deliveryStatus = "bounced";
        bounceType = data.bounce?.type || "unknown";
        break;
      case "email.complained":
        deliveryStatus = "complained";
        break;
      case "email.delivery_delayed":
        deliveryStatus = "delayed";
        break;
      default:
        // Acknowledge unknown event types without processing
        return res.json({ received: true, ignored: true });
    }

    // Update the invitation log with delivery status
    const result = await db.run(
      `UPDATE invitation_logs
       SET delivery_status = ?, delivery_updated_at = CURRENT_TIMESTAMP, bounce_type = ?
       WHERE resend_email_id = ?`,
      [deliveryStatus, bounceType, emailId]
    );

    if (result?.rowCount === 0) {
      logger.info(`Webhook: no invitation_log found for Resend email ID ${emailId}`);
    } else {
      logger.info(`Webhook: ${type} for email ${emailId} → delivery_status=${deliveryStatus}`);

      // Notify admins on bounce
      if (deliveryStatus === "bounced") {
        const invite = await db.get(
          `SELECT il.client_id, u.email as member_email, u.first_name, u.last_name
           FROM invitation_logs il
           JOIN users u ON u.id = il.user_id
           WHERE il.resend_email_id = ?`,
          [emailId]
        );
        if (invite) {
          const memberName = [invite.first_name, invite.last_name].filter(Boolean).join(" ");
          notifyBouncedInvitation({
            clientId: invite.client_id,
            memberEmail: invite.member_email,
            memberName,
            bounceType,
            db,
          }).catch(err => logger.error("Failed to send bounce notification: %s", err.message));
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Webhook processing error");
    // Always return 200 to prevent Resend from retrying on our errors
    res.json({ received: true, error: true });
  }
});

export default router;
