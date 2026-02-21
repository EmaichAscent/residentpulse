import { Resend } from "resend";

/**
 * Strip HTML to plain text for email fallback
 */
function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Lazy initialization - only create Resend instance when needed
let resend = null;

function getResendClient() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

/**
 * Build HTML email template for survey invitation
 * @param {Object} user - User object with first_name, community_name
 * @param {string} surveyLink - Full survey URL with token
 * @param {Object} [roundInfo] - Optional round info { closesAt, roundNumber }
 * @returns {string} HTML email template
 */
function buildInvitationEmail(user, surveyLink, roundInfo) {
  const firstName = user.first_name || "Board Member";
  const communityName = user.community_name || "your community";
  const managementCompany = roundInfo?.companyName || user.management_company || "your management company";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Feedback Matters</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header Banner -->
        <div style="background-color: #3B9FE7; padding: 24px 20px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 4px 0; font-weight: bold;">ResidentPulse</h1>
          <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Powered by CAM Ascent Analytics</p>
        </div>

        <div style="padding: 40px 30px;">
          <!-- Headline -->
          <h2 style="color: #333333; font-size: 22px; margin: 0 0 24px 0; font-style: italic;">Your Voice Shapes the Future</h2>

          <!-- Greeting -->
          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            Dear ${firstName},
          </p>

          <!-- Body -->
          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            <strong>${managementCompany}</strong> partners with ResidentPulse to help communities thrive through honest feedback. Your perspective as a board member at <strong>${communityName}</strong> doesn't just inform decisions — it actively shapes the future of your community.
          </p>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            <strong>A Few Minutes, A Real Impact:</strong> We respect your time, so this survey is designed to be brief. Your participation helps measure performance, identify opportunities for growth, and highlight successes.
          </p>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            <strong>What to Expect:</strong> Your feedback will be collected through a brief, conversational interview with a specialized AI trained in community management. It will ask you a few thoughtful questions — typically 5 to 10 — and you can end the conversation at any time. It's quick, easy, and your responses go directly toward improving your community experience.
          </p>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
            To get started, click the button below. <em>Please do not share this unique survey link with others.</em>
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${surveyLink}"
               style="display: inline-block;
                      background-color: #3B9FE7;
                      color: #ffffff;
                      padding: 16px 40px;
                      text-decoration: none;
                      border-radius: 8px;
                      font-weight: bold;
                      font-size: 16px;">
              Take the Survey
            </a>
          </div>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 0 0;">
            Thank you for your time and thoughtful contributions.
          </p>

          <!-- Footer -->
          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eeeeee;">
            <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
              ${roundInfo?.closesAt
                ? `This survey is open until ${new Date(roundInfo.closesAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                : "This invitation expires in 48 hours."}
            </p>
            <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0;">
              Questions? Contact your property manager.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send survey invitation email via Resend
 * @param {Object} user - User object with email, first_name, community_name
 * @param {string} token - Invitation token
 * @returns {Promise<Object>} Resend response with email ID
 */
export async function sendInvitation(user, token, roundInfo) {
  // Remove trailing slash from base URL to prevent double slashes
  const surveyBaseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const surveyLink = `${surveyBaseUrl}/survey?token=${token}`;

  const emailHtml = buildInvitationEmail(user, surveyLink, roundInfo);
  const companyName = roundInfo?.companyName || user.management_company || "ResidentPulse";

  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: `${companyName} via ResidentPulse <residentpulse@camascent.com>`,
      to: [user.email],
      subject: `Your Feedback Matters, ${user.first_name || "Board Member"}`,
      html: emailHtml,
      text: htmlToText(emailHtml),
    });

    if (error) {
      console.error("Resend API error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    console.log(`Invitation sent to ${user.email}, email ID: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`Failed to send invitation to ${user.email}:`, err.message);
    throw err;
  }
}

/**
 * Build HTML email template for password reset
 * @param {string} resetLink - Full password reset URL with token
 * @returns {string} HTML email template
 */
function buildPasswordResetEmail(resetLink) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3B9FE7; font-size: 28px; margin: 0 0 10px 0;">ResidentPulse</h1>
          <p style="color: #666666; font-size: 14px; margin: 0;">Powered by CAM Ascent</p>
        </div>

        <!-- Body -->
        <h2 style="color: #3B9FE7; font-size: 24px; margin: 0 0 20px 0;">Reset Your Password</h2>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
          We received a request to reset your password. Click the button below to choose a new password.
        </p>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
          If you didn't request this, you can safely ignore this email.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${resetLink}"
             style="display: inline-block;
                    background-color: #3B9FE7;
                    color: #ffffff;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    font-size: 16px;">
            Reset Password
          </a>
        </div>

        <!-- Footer -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee;">
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
            This link expires in 1 hour.
          </p>
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0;">
            Questions? Contact your administrator.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send password reset email via Resend
 * @param {string} email - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<Object>} Resend response with email ID
 */
export async function sendPasswordResetEmail(email, resetToken) {
  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const resetLink = `${baseUrl}/admin/reset-password?token=${resetToken}`;

  const emailHtml = buildPasswordResetEmail(resetLink);

  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: "ResidentPulse <residentpulse@camascent.com>",
      to: [email],
      subject: "Reset your password",
      html: emailHtml,
      text: htmlToText(emailHtml),
    });

    if (error) {
      console.error("Resend API error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    console.log(`Password reset email sent to ${email}, email ID: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`Failed to send password reset email to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Build HTML email template for email verification
 * @param {string} verifyLink - Full verification URL with token
 * @returns {string} HTML email template
 */
function buildVerificationEmail(verifyLink) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3B9FE7; font-size: 28px; margin: 0 0 10px 0;">ResidentPulse</h1>
          <p style="color: #666666; font-size: 14px; margin: 0;">Powered by CAM Ascent</p>
        </div>

        <!-- Body -->
        <h2 style="color: #3B9FE7; font-size: 24px; margin: 0 0 20px 0;">Verify Your Email</h2>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
          Thanks for signing up for ResidentPulse! Please click the button below to verify your email and activate your account.
        </p>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
          Once verified, you can log in and start collecting feedback from your board members.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${verifyLink}"
             style="display: inline-block;
                    background-color: #3B9FE7;
                    color: #ffffff;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    font-size: 16px;">
            Verify Email
          </a>
        </div>

        <!-- Footer -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee;">
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
            This link expires in 24 hours.
          </p>
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0;">
            Questions? Contact support at support@camascent.com.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send email verification email via Resend
 * @param {string} email - Recipient email address
 * @param {string} token - Email verification token
 * @returns {Promise<Object>} Resend response with email ID
 */
export async function sendVerificationEmail(email, token) {
  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const verifyLink = `${baseUrl}/admin/verify-email?token=${token}`;

  const emailHtml = buildVerificationEmail(verifyLink);

  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: "ResidentPulse <residentpulse@camascent.com>",
      to: [email],
      subject: "Verify your email - ResidentPulse",
      html: emailHtml,
      text: htmlToText(emailHtml),
    });

    if (error) {
      console.error("Resend API error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    console.log(`Verification email sent to ${email}, email ID: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`Failed to send verification email to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Build HTML email template for survey reminder
 * @param {Object} user - User object with first_name, community_name, management_company
 * @param {string} surveyLink - Full survey URL with token
 * @param {number} daysRemaining - Days left in the survey round
 * @returns {string} HTML email template
 */
function buildReminderEmail(user, surveyLink, daysRemaining, companyName) {
  const firstName = user.first_name || "Board Member";
  const communityName = user.community_name || "your community";
  const mgmtCompany = companyName || user.management_company || "your management company";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>We'd Still Love Your Feedback</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header Banner -->
        <div style="background-color: #3B9FE7; padding: 24px 20px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 4px 0; font-weight: bold;">ResidentPulse</h1>
          <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Powered by CAM Ascent Analytics</p>
        </div>

        <div style="padding: 40px 30px;">
          <!-- Headline -->
          <h2 style="color: #333333; font-size: 22px; margin: 0 0 24px 0; font-style: italic;">We'd Still Love to Hear From You</h2>

          <!-- Greeting -->
          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            Dear ${firstName},
          </p>

          <!-- Body -->
          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            <strong>${mgmtCompany}</strong> is still collecting feedback about your experience at <strong>${communityName}</strong>. Your voice matters — and there ${daysRemaining === 1 ? "is <strong>1 day</strong>" : `are <strong>${daysRemaining} days</strong>`} remaining to share your thoughts.
          </p>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
            The survey is a brief, conversational interview with a specialized AI trained in community management. It will ask you a few thoughtful questions and you can end it whenever you're ready. It only takes a few minutes.
          </p>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
            <em>Please do not share this unique survey link with others.</em>
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${surveyLink}"
               style="display: inline-block;
                      background-color: #1AB06E;
                      color: #ffffff;
                      padding: 16px 40px;
                      text-decoration: none;
                      border-radius: 8px;
                      font-weight: bold;
                      font-size: 16px;">
              Take the Survey
            </a>
          </div>

          <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0;">
            Thank you for your time and thoughtful contributions.
          </p>

          <!-- Footer -->
          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eeeeee;">
            <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0;">
              Questions? Contact your property manager.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send survey reminder email via Resend
 * @param {Object} user - User object with email, first_name, community_name
 * @param {string} token - Existing invitation token
 * @param {Object} options - { daysRemaining }
 * @returns {Promise<Object>} Resend response with email ID
 */
export async function sendReminder(user, token, { daysRemaining, companyName }) {
  const surveyBaseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const surveyLink = `${surveyBaseUrl}/survey?token=${token}`;

  const emailHtml = buildReminderEmail(user, surveyLink, daysRemaining, companyName);
  const fromName = companyName || user.management_company || "ResidentPulse";

  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: `${fromName} via ResidentPulse <residentpulse@camascent.com>`,
      to: [user.email],
      subject: `Friendly reminder: Your Feedback Matters, ${user.first_name || "Board Member"}`,
      html: emailHtml,
      text: htmlToText(emailHtml),
    });

    if (error) {
      console.error("Resend API error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    console.log(`Reminder sent to ${user.email}, email ID: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`Failed to send reminder to ${user.email}:`, err.message);
    throw err;
  }
}

/**
 * Build HTML email for new admin user credentials
 */
function buildNewAdminEmail(loginLink, tempPassword, { firstName, companyName }) {
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your ResidentPulse Admin Account</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3B9FE7; font-size: 28px; margin: 0 0 10px 0;">ResidentPulse</h1>
          <p style="color: #666666; font-size: 14px; margin: 0;">Powered by CAM Ascent</p>
        </div>

        <h2 style="color: #3B9FE7; font-size: 24px; margin: 0 0 20px 0;">Your Admin Account</h2>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
          ${greeting}
        </p>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
          You've been added as an admin for <strong>${companyName}</strong> on ResidentPulse. Here are your login credentials:
        </p>

        <div style="background: #f8f9fa; padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 15px;">
          <p style="margin: 0 0 8px 0;"><strong>Temporary Password:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
        </div>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
          Please change your password after your first login.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginLink}"
             style="display: inline-block; background-color: #3B9FE7; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            Log In
          </a>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee;">
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0;">
            If you didn't expect this, please contact your administrator.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send new admin credentials email via Resend
 * @param {string} email - New admin's email
 * @param {string} tempPassword - Generated temporary password
 * @param {Object} options - { firstName, companyName }
 */
export async function sendNewAdminEmail(email, tempPassword, { firstName, companyName }) {
  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const loginLink = `${baseUrl}/admin/login`;

  const emailHtml = buildNewAdminEmail(loginLink, tempPassword, { firstName, companyName });

  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: "ResidentPulse <residentpulse@camascent.com>",
      to: [email],
      subject: `You've been added as an admin — ResidentPulse`,
      html: emailHtml,
      text: htmlToText(emailHtml),
    });

    if (error) {
      console.error("Resend API error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    console.log(`New admin email sent to ${email}, email ID: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`Failed to send new admin email to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Send admin notification email (round launch, new response, round conclusion)
 * @param {string} email - Admin email address
 * @param {string} subject - Email subject line
 * @param {string} emailHtml - Prebuilt HTML body
 */
async function sendAdminNotification(email, subject, emailHtml) {
  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: "ResidentPulse <residentpulse@camascent.com>",
      to: [email],
      subject,
      html: emailHtml,
      text: htmlToText(emailHtml),
    });

    if (error) {
      console.error("Resend API error (admin notification):", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`Failed to send admin notification to ${email}:`, err.message);
    return null;
  }
}

/**
 * Notify all admins that a survey round has launched
 */
export async function notifyRoundLaunched({ clientId, roundNumber, membersInvited, closesAt, db }) {
  const admins = await db.all("SELECT email, first_name FROM client_admins WHERE client_id = ?", [clientId]);
  const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [clientId]);
  const companyName = client?.company_name || "Your company";
  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const closesDate = new Date(closesAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #3B9FE7; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Survey Round ${roundNumber} Launched</h1>
      </div>
      <div style="padding: 24px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hi {{firstName}},</p>
        <p>Round ${roundNumber} for <strong>${companyName}</strong> is now live.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color: #666;">Members invited</td><td style="padding: 8px 0; font-weight: bold;">${membersInvited}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Closes on</td><td style="padding: 8px 0; font-weight: bold;">${closesDate}</td></tr>
        </table>
        <p>Invitations have been sent. You can track responses from your dashboard.</p>
        <a href="${baseUrl}/admin" style="display: inline-block; background: #3B9FE7; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Dashboard</a>
        <p style="margin-top: 24px; font-size: 12px; color: #999;">ResidentPulse by CAMAscent</p>
      </div>
    </div>`;

  for (const admin of admins) {
    const personalized = html.replace("{{firstName}}", admin.first_name || "there");
    await sendAdminNotification(admin.email, `Round ${roundNumber} launched — ${membersInvited} invitations sent`, personalized);
  }
}

/**
 * Notify all admins that a new survey response was received
 */
export async function notifyNewResponse({ clientId, roundNumber, respondentName, communityName, totalResponses, totalInvited, db }) {
  const admins = await db.all("SELECT email, first_name FROM client_admins WHERE client_id = ?", [clientId]);
  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const responseRate = totalInvited > 0 ? Math.round((totalResponses / totalInvited) * 100) : 0;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #1AB06E; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">New Survey Response</h1>
      </div>
      <div style="padding: 24px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hi {{firstName}},</p>
        <p><strong>${respondentName}</strong>${communityName ? ` from ${communityName}` : ""} just completed their Round ${roundNumber} survey.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color: #666;">Responses so far</td><td style="padding: 8px 0; font-weight: bold;">${totalResponses} of ${totalInvited}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Response rate</td><td style="padding: 8px 0; font-weight: bold;">${responseRate}%</td></tr>
        </table>
        <a href="${baseUrl}/admin" style="display: inline-block; background: #3B9FE7; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Responses</a>
        <p style="margin-top: 24px; font-size: 12px; color: #999;">ResidentPulse by CAMAscent</p>
      </div>
    </div>`;

  for (const admin of admins) {
    const personalized = html.replace("{{firstName}}", admin.first_name || "there");
    await sendAdminNotification(admin.email, `New response — Round ${roundNumber} (${totalResponses}/${totalInvited})`, personalized);
  }
}

/**
 * Notify all admins that a survey round has concluded
 */
export async function notifyRoundConcluded({ clientId, roundNumber, totalResponses, totalInvited, db }) {
  const admins = await db.all("SELECT email, first_name FROM client_admins WHERE client_id = ?", [clientId]);
  const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [clientId]);
  const companyName = client?.company_name || "Your company";
  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const responseRate = totalInvited > 0 ? Math.round((totalResponses / totalInvited) * 100) : 0;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #3B9FE7; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Round ${roundNumber} Complete</h1>
      </div>
      <div style="padding: 24px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hi {{firstName}},</p>
        <p>Survey Round ${roundNumber} for <strong>${companyName}</strong> has concluded.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color: #666;">Total responses</td><td style="padding: 8px 0; font-weight: bold;">${totalResponses} of ${totalInvited}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Response rate</td><td style="padding: 8px 0; font-weight: bold;">${responseRate}%</td></tr>
        </table>
        <p>AI-powered insights are being generated and will be available on your dashboard shortly.</p>
        <a href="${baseUrl}/admin" style="display: inline-block; background: #3B9FE7; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">View Results</a>
        <p style="margin-top: 24px; font-size: 12px; color: #999;">ResidentPulse by CAMAscent</p>
      </div>
    </div>`;

  for (const admin of admins) {
    const personalized = html.replace("{{firstName}}", admin.first_name || "there");
    await sendAdminNotification(admin.email, `Round ${roundNumber} complete — ${responseRate}% response rate`, personalized);
  }
}

export default { sendInvitation, sendPasswordResetEmail, sendVerificationEmail, sendReminder, sendNewAdminEmail, notifyRoundLaunched, notifyNewResponse, notifyRoundConcluded };
