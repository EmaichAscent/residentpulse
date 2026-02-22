import crypto from "crypto";
import logger from "./logger.js";

// --- OAuth Token Management ---
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Check if Zoho Subscriptions env vars are configured
 */
export function isZohoConfigured() {
  return !!(
    process.env.ZOHO_CLIENT_ID &&
    process.env.ZOHO_CLIENT_SECRET &&
    process.env.ZOHO_REFRESH_TOKEN &&
    process.env.ZOHO_ORG_ID
  );
}

/**
 * Get a valid OAuth access token, refreshing if expired
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Zoho OAuth error: ${data.error}`);
  }

  cachedToken = data.access_token;
  // Expire 60 seconds early to avoid edge cases
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Create a Zoho hosted checkout session for a new subscription
 * @param {Object} options
 * @param {string} options.planCode - Zoho plan code (e.g. 'growth-100')
 * @param {Object} options.customerInfo - Customer details { display_name, email, first_name, last_name, phone, company_name }
 * @param {number} options.clientId - Our internal client ID (stored as custom field for webhook linking)
 * @param {string} options.redirectUrl - URL to redirect after successful payment
 * @returns {Promise<{hostedpage_id: string, url: string}>}
 */
export async function createCheckoutSession({ planCode, customerInfo, clientId, redirectUrl }) {
  if (!isZohoConfigured()) {
    throw new Error("Zoho Subscriptions is not configured");
  }

  const token = await getAccessToken();

  const body = {
    plan: {
      plan_code: planCode,
    },
    customer: {
      display_name: customerInfo.display_name || customerInfo.company_name || "",
      email: customerInfo.email,
      first_name: customerInfo.first_name || "",
      last_name: customerInfo.last_name || "",
      phone: customerInfo.phone || "",
      company_name: customerInfo.company_name || "",
    },
    redirect_url: redirectUrl,
    additional_param: String(clientId),
  };

  const response = await fetch(
    "https://www.zohoapis.com/billing/v1/hostedpages/newsubscription",
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "X-com-zoho-subscriptions-organizationid": process.env.ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (data.code !== 0 && !data.hostedpage) {
    logger.error({ data }, "Zoho Hosted Pages API error");
    throw new Error(data.message || "Failed to create Zoho checkout session");
  }

  const hostedpage = data.hostedpage || data;
  return {
    hostedpage_id: hostedpage.hostedpage_id,
    url: hostedpage.url,
  };
}

/**
 * Verify Zoho webhook signature (HMAC-SHA256)
 * @param {string} rawBody - Raw request body string
 * @param {string} signature - Value of X-Zoho-Webhook-Signature header
 * @returns {boolean}
 */
export function verifyZohoWebhook(rawBody, signature) {
  const secret = process.env.ZOHO_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("ZOHO_WEBHOOK_SECRET not set — skipping webhook verification");
    return true;
  }

  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Create a Zoho hosted page to update (upgrade/downgrade) an existing subscription
 * @param {Object} options
 * @param {string} options.zohoSubscriptionId - Existing Zoho subscription ID
 * @param {string} options.newPlanCode - New plan code to switch to
 * @param {string} options.redirectUrl - URL to redirect after successful update
 * @returns {Promise<{hostedpage_id: string, url: string}>}
 */
export async function updateSubscriptionHostedPage({ zohoSubscriptionId, newPlanCode, redirectUrl }) {
  if (!isZohoConfigured()) {
    throw new Error("Zoho Subscriptions is not configured");
  }

  const token = await getAccessToken();

  const body = {
    subscription_id: zohoSubscriptionId,
    plan: {
      plan_code: newPlanCode,
    },
    redirect_url: redirectUrl,
  };

  const response = await fetch(
    "https://www.zohoapis.com/billing/v1/hostedpages/updatesubscription",
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "X-com-zoho-subscriptions-organizationid": process.env.ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (data.code !== 0 && !data.hostedpage) {
    logger.error({ data }, "Zoho Update Subscription API error");
    throw new Error(data.message || "Failed to create Zoho update session");
  }

  const hostedpage = data.hostedpage || data;
  return {
    hostedpage_id: hostedpage.hostedpage_id,
    url: hostedpage.url,
  };
}

/**
 * Cancel a Zoho subscription at end of billing period
 * @param {string} zohoSubscriptionId - Zoho subscription ID
 * @returns {Promise<Object>} Zoho API response
 */
export async function cancelSubscription(zohoSubscriptionId) {
  if (!isZohoConfigured()) {
    throw new Error("Zoho Subscriptions is not configured");
  }

  const token = await getAccessToken();

  const response = await fetch(
    `https://www.zohoapis.com/billing/v1/subscriptions/${zohoSubscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "X-com-zoho-subscriptions-organizationid": process.env.ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancel_at_end: true }),
    }
  );

  const data = await response.json();

  if (data.code !== 0) {
    logger.error({ data }, "Zoho Cancel Subscription API error");
    throw new Error(data.message || "Failed to cancel subscription");
  }

  return data;
}

/**
 * Reactivate a Zoho subscription that was scheduled for cancellation
 * @param {string} zohoSubscriptionId - Zoho subscription ID
 * @returns {Promise<Object>} Zoho API response
 */
export async function reactivateSubscription(zohoSubscriptionId) {
  if (!isZohoConfigured()) {
    throw new Error("Zoho Subscriptions is not configured");
  }

  const token = await getAccessToken();

  const response = await fetch(
    `https://www.zohoapis.com/billing/v1/subscriptions/${zohoSubscriptionId}/reactivate`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "X-com-zoho-subscriptions-organizationid": process.env.ZOHO_ORG_ID,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();

  if (data.code !== 0) {
    logger.error({ data }, "Zoho Reactivate Subscription API error");
    throw new Error(data.message || "Failed to reactivate subscription");
  }

  return data;
}

export default {
  isZohoConfigured, createCheckoutSession, verifyZohoWebhook,
  updateSubscriptionHostedPage, cancelSubscription, reactivateSubscription
};
