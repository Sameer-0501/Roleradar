/**
 * Email Verification Template.
 *
 * Renders transactional email verifying ownership of a user's email address.
 *
 * CRITICAL SAFETY RULES:
 * - Direct verification link (no third-party tracking or redirect wrappers).
 * - Clear 24-hour expiration notice.
 * - Raw token is only passed in the verification link and never logged.
 */

export interface VerificationEmailData {
  recipientName?: string | null;
  verificationUrl: string;
  expiresInHours?: number;
}

export function renderVerificationEmail(data: VerificationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const greetingName = data.recipientName ? data.recipientName.split(' ')[0] : 'there';
  const hours = data.expiresInHours ?? 24;
  const subject = '🔐 Verify your email address — RoleRadar Job Alerts';

  const text = `Hi ${greetingName},

Thank you for signing up for RoleRadar!

Please verify your email address to enable automated verified job alerts:
${data.verificationUrl}

This verification link will expire in ${hours} hours.

If you did not create an account on RoleRadar, you can safely ignore this email.

---
RoleRadar — Verified Job Alerts directly from official career portals.
`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      color: #0f172a;
    }
    .email-wrapper {
      max-width: 540px;
      margin: 24px auto;
      padding: 0 16px;
    }
    .brand {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      padding: 16px 0;
    }
    .email-card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .heading {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 12px 0;
    }
    .btn-verify {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 28px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .notice {
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      padding: 20px 0;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="brand">RoleRadar <span style="font-size:13px; font-weight: normal; color:#64748b;">· Verified Job Alerts</span></div>
    <div class="email-card">
      <h1 class="heading">Verify Your Email Address</h1>
      <p style="font-size: 15px; color: #334155; margin-top: 0;">Hi ${escapeHtml(greetingName)},</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.5;">
        Please confirm that you own this email address to activate your RoleRadar account and begin receiving automated alerts for verified job openings matching your preferences.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(data.verificationUrl)}" target="_blank" rel="noopener noreferrer" class="btn-verify">
          Verify Email Address →
        </a>
      </div>
      <p class="notice">
        This link will expire in <strong>${hours} hours</strong>. If the button above doesn't work, copy and paste this URL into your browser:<br>
        <span style="color: #2563eb; word-break: break-all;">${escapeHtml(data.verificationUrl)}</span>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p class="notice" style="margin-bottom: 0;">
        If you did not sign up for RoleRadar, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      RoleRadar — Direct from verified official career systems.
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
