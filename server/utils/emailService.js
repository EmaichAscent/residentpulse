import { Resend } from "resend";

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
 * @returns {string} HTML email template
 */
function buildInvitationEmail(user, surveyLink) {
  const firstName = user.first_name || "Board Member";
  const communityText = user.community_name ? ` of ${user.community_name}` : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Share Your Feedback</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3B9FE7; font-size: 28px; margin: 0 0 10px 0;">ResidentPulse</h1>
          <p style="color: #666666; font-size: 14px; margin: 0;">Powered by CAM Ascent</p>
        </div>

        <!-- Greeting -->
        <h2 style="color: #3B9FE7; font-size: 24px; margin: 0 0 20px 0;">Hi ${firstName},</h2>

        <!-- Body -->
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
          We value your perspective as a board member${communityText}.
        </p>

        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
          We'd love to hear your feedback about our management services. This quick survey takes just 2-3 minutes and helps us serve you better.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${surveyLink}"
             style="display: inline-block;
                    background-color: #3B9FE7;
                    color: #ffffff;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    font-size: 16px;">
            Share Your Feedback
          </a>
        </div>

        <!-- Footer -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee;">
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
            This invitation expires in 48 hours.
          </p>
          <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0;">
            Questions? Contact your property manager.
          </p>
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
export async function sendInvitation(user, token) {
  // Remove trailing slash from base URL to prevent double slashes
  const surveyBaseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const surveyLink = `${surveyBaseUrl}/survey?token=${token}`;

  const emailHtml = buildInvitationEmail(user, surveyLink);

  try {
    const resendClient = getResendClient();
    const { data, error } = await resendClient.emails.send({
      from: "ResidentPulse <residentpulse@camascent.com>",
      to: [user.email],
      subject: `We'd love your feedback, ${user.first_name || "Board Member"}`,
      html: emailHtml,
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

export default { sendInvitation, sendPasswordResetEmail };
