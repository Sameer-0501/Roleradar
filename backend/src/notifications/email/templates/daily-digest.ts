/**
 * Daily Digest Email Template.
 *
 * Consolidates multiple verified job matches discovered over the last 24 hours
 * into a single clean summary email for the user.
 */

export interface DigestJobItem {
  companyName: string;
  title: string;
  location?: string | null;
  externalJobId: string;
  officialUrl: string;
  sourceSystem: string;
  matchSummary: string;
}

export interface DailyDigestTemplateData {
  recipientName?: string | null;
  jobs: DigestJobItem[];
  digestDateStr: string;
}

export function renderDailyDigestEmail(data: DailyDigestTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const greetingName = data.recipientName ? data.recipientName.split(' ')[0] : 'there';
  const jobCount = data.jobs.length;
  const subject = `📋 Your Daily Verified Job Matches (${jobCount} new opening${jobCount !== 1 ? 's' : ''}) — ${data.digestDateStr}`;

  const textJobList = data.jobs
    .map(
      (j, idx) =>
        `${idx + 1}. ${j.title} at ${j.companyName}\n` +
        `   Location: ${j.location || 'Not Specified'} | Job ID: ${j.externalJobId}\n` +
        `   Match: ${j.matchSummary}\n` +
        `   Official Link: ${j.officialUrl}\n`
    )
    .join('\n');

  const text = `Hi ${greetingName},

Here are your verified job matches detected across official career systems for ${data.digestDateStr}:

${textJobList}

---
View all your matched jobs in your dashboard: http://localhost:5173/#/dashboard
Manage your alert preferences: http://localhost:5173/#/preferences
`;

  const jobCardsHtml = data.jobs
    .map(
      (job) => `
    <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 14px; background-color: #ffffff;">
      <div style="font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
        ${escapeHtml(job.companyName)} <span style="color: #059669; font-weight: 600; font-size: 11px; margin-left: 6px;">✓ Verified Official</span>
      </div>
      <div style="font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
        ${escapeHtml(job.title)}
      </div>
      <div style="font-size: 13px; color: #475569; margin-bottom: 8px;">
        📍 ${escapeHtml(job.location || 'Location Not Specified')} · Job ID: ${escapeHtml(job.externalJobId)}
      </div>
      <div style="font-size: 12px; color: #2563eb; background-color: #eff6ff; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 12px;">
        🎯 ${escapeHtml(job.matchSummary)}
      </div>
      <div>
        <a href="${escapeHtml(job.officialUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 6px;">
          View Official Job →
        </a>
      </div>
    </div>
  `
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #0f172a;">
  <div style="max-width: 600px; margin: 24px auto; padding: 0 16px;">
    <div style="padding: 16px 0; text-align: left;">
      <div style="font-size: 20px; font-weight: 700; color: #0f172a;">KCarrier <span style="font-size: 13px; font-weight: normal; color: #64748b;">· Daily Verified Digest</span></div>
    </div>
    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="font-size: 16px; color: #334155; margin-top: 0;">Hi ${escapeHtml(greetingName)},</p>
      <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">
        We found <strong>${jobCount} new verified job match${jobCount !== 1 ? 'es' : ''}</strong> matching your target profile over the last 24 hours:
      </p>

      ${jobCardsHtml}

      <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <a href="http://localhost:5173/#/dashboard" style="display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px;">
          Open Dashboard →
        </a>
      </div>
    </div>
    <div style="text-align: center; padding: 20px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
      You received this daily digest because you enabled digest notifications on KCarrier.<br>
      <a href="http://localhost:5173/#/preferences" style="color: #64748b;">Manage Alert Preferences</a>
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
