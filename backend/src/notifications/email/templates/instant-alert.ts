/**
 * Instant Job Alert Email Template.
 *
 * Formats a clean, professional, responsive email alerting the user
 * to a verified job opening matching their preferences.
 *
 * CRITICAL SAFETY RULES:
 * - Link points DIRECTLY to the official job URL (no tracker/affiliate redirects).
 * - "Detected by KCarrier" wording used (never fabricated posting dates).
 * - Only real, verified job information rendered.
 */

export interface InstantAlertTemplateData {
  recipientName?: string | null;
  companyName: string;
  jobTitle: string;
  location?: string | null;
  externalJobId: string;
  officialUrl: string;
  sourceSystem: string;
  matchSummary: string;
  matchReasons: string[];
  firstSeenAt?: Date | null;
  /**
   * Which discovery path found this job.
   * 'NEW_JOB'    → "🆕 New Verified Job" subject/body wording.
   * 'RECENT_JOB' → "📋 Recently Posted Job" subject/body wording.
   * Defaults to 'NEW_JOB' when absent.
   */
  discoveryReason?: 'NEW_JOB' | 'RECENT_JOB' | null;
}

export function renderInstantAlertEmail(data: InstantAlertTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const greetingName = data.recipientName ? data.recipientName.split(' ')[0] : 'there';
  const locationText = data.location || 'Location Not Specified';
  const isRecent = data.discoveryReason === 'RECENT_JOB';
  const subject = isRecent
    ? `📋 Recently Posted Job: ${data.jobTitle} at ${data.companyName}`
    : `🆕 New Verified Job: ${data.jobTitle} at ${data.companyName}`;
  const detectionLine = isRecent
    ? 'A recently posted verified job matching your preferences was found by KCarrier.'
    : 'A new verified job opening matching your preferences was detected by KCarrier.';

  let detectedTimeFormatted = 'Recently';
  if (data.firstSeenAt) {
    const timeString = data.firstSeenAt.toISOString().slice(11, 19);
    const msAgo = Date.now() - data.firstSeenAt.getTime();
    const minutesAgo = Math.max(0, Math.floor(msAgo / 60000));
    
    if (minutesAgo === 0) {
      detectedTimeFormatted = `Just now (${timeString} UTC)`;
    } else if (minutesAgo < 60) {
      detectedTimeFormatted = `${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago (${timeString} UTC)`;
    } else {
      const hoursAgo = Math.floor(minutesAgo / 60);
      detectedTimeFormatted = `${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago (${timeString} UTC)`;
    }
  }

  const text = `Hi ${greetingName},

${detectionLine}

Company: ${data.companyName}
Role: ${data.jobTitle}
Location: ${locationText}
Job ID: ${data.externalJobId}
Source: ${data.sourceSystem}
Detected: ${detectedTimeFormatted}
Why it matches: ${data.matchSummary}

✓ Verified Official Job — Directly from ${data.companyName}'s official career system.

View the official job posting:
${data.officialUrl}

---
You received this email because you enabled instant job alerts on KCarrier.
Manage your alert preferences at: http://localhost:5173/#/preferences
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
      max-width: 580px;
      margin: 24px auto;
      padding: 0 16px;
    }
    .email-header {
      padding: 20px 0 16px 0;
      text-align: left;
    }
    .brand {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .email-card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .greeting {
      font-size: 16px;
      color: #334155;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .verified-badge {
      display: inline-block;
      background-color: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .job-title {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 6px 0;
      line-height: 1.3;
    }
    .job-company {
      font-size: 16px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 16px;
    }
    .job-meta-table {
      width: 100%;
      border-collapse: collapse;
      margin: 18px 0;
      background-color: #f8fafc;
      border-radius: 8px;
    }
    .job-meta-table td {
      padding: 10px 14px;
      font-size: 14px;
      border-bottom: 1px solid #edf2f7;
    }
    .job-meta-table tr:last-child td {
      border-bottom: none;
    }
    .meta-label {
      font-weight: 600;
      color: #64748b;
      width: 32%;
    }
    .meta-value {
      color: #0f172a;
    }
    .match-box {
      background-color: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 12px 14px;
      border-radius: 4px;
      margin: 18px 0;
      font-size: 13px;
      color: #1e3a8a;
    }
    .match-box-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .btn-action {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 24px;
      border-radius: 8px;
      margin-top: 10px;
      margin-bottom: 10px;
    }
    .email-footer {
      text-align: center;
      padding: 20px 0;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      <div class="brand">KCarrier <span style="font-size:13px; font-weight: normal; color:#64748b;">· Verified Job Alerts</span></div>
    </div>
    <div class="email-card">
      <p class="greeting">Hi ${escapeHtml(greetingName)},</p>
      <span class="verified-badge">✓ Verified Official Job</span>
      <h1 class="job-title">${escapeHtml(data.jobTitle)}</h1>
      <div class="job-company">${escapeHtml(data.companyName)}</div>

      <table class="job-meta-table">
        <tr>
          <td class="meta-label">Location</td>
          <td class="meta-value">${escapeHtml(locationText)}</td>
        </tr>
        <tr>
          <td class="meta-label">Job ID</td>
          <td class="meta-value">${escapeHtml(data.externalJobId)}</td>
        </tr>
        <tr>
          <td class="meta-label">Source</td>
          <td class="meta-value">${escapeHtml(data.sourceSystem)} Official Portal</td>
        </tr>
        <tr>
          <td class="meta-label">Detected</td>
          <td class="meta-value">${escapeHtml(detectedTimeFormatted)}</td>
        </tr>
      </table>

      <div class="match-box">
        <div class="match-box-title">🎯 Why this matches your profile</div>
        <div>${escapeHtml(data.matchSummary)}</div>
      </div>

      <div style="text-align: center; margin: 24px 0 12px 0;">
        <a href="${escapeHtml(data.officialUrl)}" target="_blank" rel="noopener noreferrer" class="btn-action">
          View Official Job →
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
        Direct link to official career system. No aggregator redirects.
      </p>
    </div>
    <div class="email-footer">
      You are receiving this alert because you enabled instant notifications on KCarrier.<br>
      <a href="http://localhost:5173/#/preferences" style="color: #64748b;">Manage Preferences</a>
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
