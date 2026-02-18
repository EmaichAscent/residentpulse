import { Router } from "express";
import db from "../db.js";

const router = Router();

/**
 * Resend webhook endpoint — receives email delivery events.
 * Events: email.sent, email.delivered, email.bounced, email.complained, email.delivery_delayed
 *
 * Configure in Resend dashboard:
 *   URL: https://residentpulse-production.up.railway.app/api/webhooks/resend
 *   Events: email.delivered, email.bounced, email.complained
 *
 * Optional: Set RESEND_WEBHOOK_SECRET env var for signature verification.
 */
router.post("/resend", async (req, res) => {
  try {
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
      console.log(`Webhook: no invitation_log found for Resend email ID ${emailId}`);
    } else {
      console.log(`Webhook: ${type} for email ${emailId} → delivery_status=${deliveryStatus}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Always return 200 to prevent Resend from retrying on our errors
    res.json({ received: true, error: true });
  }
});

export default router;
