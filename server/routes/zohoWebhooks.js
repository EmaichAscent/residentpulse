import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { verifyZohoWebhook } from "../utils/zohoService.js";
import { sendVerificationEmail } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";
import { deactivateExcessMembers } from "../utils/deactivateExcessMembers.js";

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

      case "subscription_upgraded":
      case "subscription_downgraded":
        await handleSubscriptionPlanChanged(data, event_type);
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

  // Try 1: New signup flow — activate pending_payment subscription
  const result = await db.run(
    `UPDATE client_subscriptions
     SET status = 'active', zoho_subscription_id = ?, zoho_customer_id = ?,
         started_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND status = 'pending_payment'`,
    [zohoSubscriptionId || null, zohoCustomerId || null, clientId]
  );

  if (result.changes > 0) {
    // New signup: activate client and send verification email
    await db.run(
      "UPDATE clients SET status = 'active' WHERE id = ? AND status = 'pending'",
      [clientId]
    );

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
  } else {
    // Try 2: Existing free user upgrading to paid — update plan + link Zoho IDs
    const planCode = subscription.plan?.plan_code || subscription.plan_code;
    if (planCode) {
      const plan = await db.get("SELECT id FROM subscription_plans WHERE zoho_plan_code = ?", [planCode]);
      if (plan) {
        const upgradeResult = await db.run(
          `UPDATE client_subscriptions
           SET plan_id = ?, zoho_subscription_id = ?, zoho_customer_id = ?,
               started_at = CURRENT_TIMESTAMP
           WHERE client_id = ? AND zoho_subscription_id IS NULL`,
          [plan.id, zohoSubscriptionId || null, zohoCustomerId || null, clientId]
        );
        if (upgradeResult.changes > 0) {
          console.log(`Client ${clientId} upgraded from free to ${planCode} via Zoho webhook`);
        } else {
          console.log(`Zoho webhook: subscription for client ${clientId} already active or not found`);
          return;
        }
      } else {
        console.log(`Zoho webhook: unknown plan code ${planCode} for client ${clientId}`);
        return;
      }
    } else {
      console.log(`Zoho webhook: subscription for client ${clientId} already active or not found`);
      return;
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
 * Handle plan upgrade or downgrade
 */
async function handleSubscriptionPlanChanged(data, eventType) {
  const subscription = data.subscription || data;
  const zohoSubscriptionId = subscription.subscription_id;
  if (!zohoSubscriptionId) return;

  const newPlanCode = subscription.plan?.plan_code || subscription.plan_code;
  if (!newPlanCode) {
    console.error("Zoho webhook: no plan_code in plan change event", JSON.stringify(data).slice(0, 500));
    return;
  }

  // Look up our internal plan by zoho_plan_code
  const newPlan = await db.get(
    "SELECT id, name, member_limit FROM subscription_plans WHERE zoho_plan_code = ?",
    [newPlanCode]
  );

  if (!newPlan) {
    console.error(`Zoho webhook: unknown plan code ${newPlanCode}`);
    return;
  }

  // Find the client subscription
  const sub = await db.get(
    "SELECT cs.client_id, COALESCE(cs.custom_member_limit, sp.member_limit) as current_limit FROM client_subscriptions cs JOIN subscription_plans sp ON sp.id = cs.plan_id WHERE cs.zoho_subscription_id = ?",
    [zohoSubscriptionId]
  );

  if (!sub) {
    console.error(`Zoho webhook: no subscription found for zoho_subscription_id ${zohoSubscriptionId}`);
    return;
  }

  // Update plan and period end
  const nextBillingAt = subscription.next_billing_at || subscription.current_term_ends_at;
  await db.run(
    `UPDATE client_subscriptions
     SET plan_id = ?, status = 'active', cancel_at_period_end = FALSE,
         current_period_end = ?
     WHERE zoho_subscription_id = ?`,
    [newPlan.id, nextBillingAt || null, zohoSubscriptionId]
  );

  // If downgrade and over new limit, deactivate excess members
  if (eventType === "subscription_downgraded" && newPlan.member_limit > 0) {
    const result = await deactivateExcessMembers(sub.client_id, newPlan.member_limit);
    if (result.deactivatedCount > 0) {
      console.log(`Deactivated ${result.deactivatedCount} excess members for client ${sub.client_id} after downgrade`);
    }
  }

  await logActivity({
    actorType: "system",
    action: `zoho_subscription_${eventType === "subscription_upgraded" ? "upgraded" : "downgraded"}`,
    entityType: "client",
    entityId: sub.client_id,
    clientId: sub.client_id,
    metadata: { zoho_subscription_id: zohoSubscriptionId, new_plan: newPlan.name }
  });

  console.log(`Client ${sub.client_id} plan changed to ${newPlan.name} via Zoho webhook`);
}

/**
 * Handle subscription cancellation — downgrade to free plan
 */
async function handleSubscriptionCancelled(data) {
  const subscription = data.subscription || data;
  const zohoSubscriptionId = subscription.subscription_id;
  if (!zohoSubscriptionId) return;

  const sub = await db.get(
    "SELECT client_id FROM client_subscriptions WHERE zoho_subscription_id = ?",
    [zohoSubscriptionId]
  );

  if (!sub) return;

  // Look up free plan
  const freePlan = await db.get("SELECT id, member_limit FROM subscription_plans WHERE name = 'free'");
  if (!freePlan) {
    console.error("Zoho webhook: free plan not found in database");
    return;
  }

  // Downgrade to free: clear Zoho fields, reset status
  await db.run(
    `UPDATE client_subscriptions
     SET plan_id = ?, status = 'active', cancel_at_period_end = FALSE,
         zoho_subscription_id = NULL, zoho_customer_id = NULL,
         current_period_end = NULL
     WHERE client_id = ?`,
    [freePlan.id, sub.client_id]
  );

  // Reset cadence to 2 if it was 4 (free plan only supports 2)
  await db.run(
    "UPDATE client_subscriptions SET survey_cadence = 2 WHERE client_id = ? AND survey_cadence > 2",
    [sub.client_id]
  );

  // Deactivate excess members beyond free limit
  const result = await deactivateExcessMembers(sub.client_id, freePlan.member_limit);
  if (result.deactivatedCount > 0) {
    console.log(`Deactivated ${result.deactivatedCount} excess members for client ${sub.client_id} after cancel`);
  }

  await logActivity({
    actorType: "system",
    action: "zoho_subscription_cancelled_downgraded_to_free",
    entityType: "client",
    entityId: sub.client_id,
    clientId: sub.client_id,
    metadata: { zoho_subscription_id: zohoSubscriptionId, deactivated_members: result.deactivatedCount }
  });

  console.log(`Client ${sub.client_id} downgraded to free plan after subscription cancellation`);
}

/**
 * Handle subscription expiration — same as cancel, downgrade to free
 */
async function handleSubscriptionExpired(data) {
  // Treat expiration the same as cancellation — downgrade to free
  await handleSubscriptionCancelled(data);
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
