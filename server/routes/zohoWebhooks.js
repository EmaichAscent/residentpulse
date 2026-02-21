import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { verifyZohoWebhook } from "../utils/zohoService.js";
import { sendVerificationEmail } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";

const router = Router();

/**
 * Handle Zoho Subscriptions webhook events
 * POST /api/webhooks/zoho
 */
router.post("/zoho", async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers["x-zoho-webhook-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!verifyZohoWebhook(rawBody, signature)) {
      console.warn("Zoho webhook signature verification failed");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { event_type, data } = req.body;
    console.log(`Zoho webhook received: ${event_type}`);

    switch (event_type) {
      case "subscription_created":
      case "subscription_activated":
        await handleSubscriptionActivated(data);
        break;

      case "subscription_cancelled":
        await handleSubscriptionCancelled(data);
        break;

      case "subscription_expired":
        await handleSubscriptionExpired(data);
        break;

      case "payment_declined":
        await handlePaymentDeclined(data);
        break;

      default:
        console.log(`Zoho webhook: unhandled event type ${event_type}`);
    }

    // Always return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (err) {
    console.error("Zoho webhook processing error:", err);
    // Still return 200 to prevent retries on our errors
    res.json({ received: true, error: true });
  }
});

/**
 * Activate a client after successful payment
 */
async function handleSubscriptionActivated(data) {
  const subscription = data.subscription || data;
  const zohoSubscriptionId = subscription.subscription_id;
  const zohoCustomerId = subscription.customer?.customer_id || subscription.customer_id;

  // Retrieve our client_id from the additional_param we passed during checkout
  const clientId = parseInt(
    subscription.custom_fields?.find?.(f => f.label === "additional_param")?.value
    || subscription.additional_param
    || data.additional_param
  );

  if (!clientId || isNaN(clientId)) {
    console.error("Zoho webhook: no client_id found in subscription data", JSON.stringify(data).slice(0, 500));
    return;
  }

  // Update subscription to active (idempotent — only affects pending_payment)
  const result = await db.run(
    `UPDATE client_subscriptions
     SET status = 'active', zoho_subscription_id = ?, zoho_customer_id = ?,
         started_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND status = 'pending_payment'`,
    [zohoSubscriptionId || null, zohoCustomerId || null, clientId]
  );

  if (result.changes === 0) {
    console.log(`Zoho webhook: subscription for client ${clientId} already active or not found`);
    return;
  }

  // Activate the client (was 'pending')
  await db.run(
    "UPDATE clients SET status = 'active' WHERE id = ? AND status = 'pending'",
    [clientId]
  );

  // Generate verification token and send verification email
  const admin = await db.get(
    "SELECT id, email FROM client_admins WHERE client_id = ? LIMIT 1",
    [clientId]
  );

  if (admin?.email) {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.run(
      "UPDATE client_admins SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?",
      [verificationToken, expires.toISOString(), admin.id]
    );

    try {
      await sendVerificationEmail(admin.email, verificationToken);
      console.log(`Verification email sent to ${admin.email} after Zoho payment`);
    } catch (emailErr) {
      console.error("Failed to send verification email after payment:", emailErr.message);
    }
  }

  await logActivity({
    actorType: "system",
    action: "zoho_subscription_activated",
    entityType: "client",
    entityId: clientId,
    clientId,
    metadata: { zoho_subscription_id: zohoSubscriptionId }
  });

  console.log(`Client ${clientId} activated via Zoho webhook`);
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCancelled(data) {
  const subscription = data.subscription || data;
  const zohoSubscriptionId = subscription.subscription_id;
  if (!zohoSubscriptionId) return;

  const result = await db.run(
    "UPDATE client_subscriptions SET status = 'canceled' WHERE zoho_subscription_id = ?",
    [zohoSubscriptionId]
  );

  if (result.changes > 0) {
    const sub = await db.get(
      "SELECT client_id FROM client_subscriptions WHERE zoho_subscription_id = ?",
      [zohoSubscriptionId]
    );
    if (sub) {
      await logActivity({
        actorType: "system",
        action: "zoho_subscription_cancelled",
        entityType: "client",
        entityId: sub.client_id,
        clientId: sub.client_id,
        metadata: { zoho_subscription_id: zohoSubscriptionId }
      });
    }
  }
}

/**
 * Handle subscription expiration
 */
async function handleSubscriptionExpired(data) {
  const subscription = data.subscription || data;
  const zohoSubscriptionId = subscription.subscription_id;
  if (!zohoSubscriptionId) return;

  await db.run(
    "UPDATE client_subscriptions SET status = 'expired' WHERE zoho_subscription_id = ?",
    [zohoSubscriptionId]
  );
}

/**
 * Handle declined payment (log only — Zoho will retry)
 */
async function handlePaymentDeclined(data) {
  const subscription = data.subscription || data;
  const zohoSubscriptionId = subscription.subscription_id;
  if (!zohoSubscriptionId) return;

  const sub = await db.get(
    "SELECT client_id FROM client_subscriptions WHERE zoho_subscription_id = ?",
    [zohoSubscriptionId]
  );

  if (sub) {
    await logActivity({
      actorType: "system",
      action: "zoho_payment_declined",
      entityType: "client",
      entityId: sub.client_id,
      clientId: sub.client_id,
      metadata: { zoho_subscription_id: zohoSubscriptionId }
    });
  }
}

export default router;
