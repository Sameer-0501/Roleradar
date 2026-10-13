export interface WindowedDigestJob {
  companyName: string;
  title: string;
  location: string | null;
  workplaceType?: string | null;
  experience?: string | null;
  externalJobId: string;
  officialUrl: string;
  sourceSystem: string;
  matchSummary: string;
}

export interface WindowedDigestEmailData {
  recipientName: string;
  digestDateStr: string;
  windowStr: string;
  jobs: WindowedDigestJob[];
  additionalMatchesCount: number;
}

export function renderWindowedDigestEmail(data: WindowedDigestEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const jobCountText = data.jobs.length === 1 ? '1 new job matches your preferences' : `${data.jobs.length} new jobs match your preferences`;
  const subject = `RoleRadar \u2014 New Job Matches`;

  let html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no, address=no, email=no, date=no, url=no" />
  <title>${jobCountText} | RoleRadar</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .btn-apply:hover { background-color: #1d4ed8 !important; }
    .job-card-link:hover { color: #1d4ed8 !important; }
    @media only screen and (max-width: 600px) {
      .responsive-table { width: 100% !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
      .mobile-title { font-size: 18px !important; line-height: 24px !important; }
      .mobile-card { padding: 16px !important; }
      .mobile-btn-wrapper { width: 100% !important; display: block !important; }
      .mobile-btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
      .header-meta { font-size: 13px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; -webkit-font-smoothing: antialiased;">
  <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; font-family: Arial; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    We spotted ${data.jobs.length} new high-matching roles just for you!
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 24px 12px 40px 12px;">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600"><tr><td align="center" valign="top" width="600">
        <![endif]-->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;" class="responsive-table">
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 24px 24px 24px; border-bottom: 3px solid #2563eb;" class="mobile-padding">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color: #2563eb; width: 36px; height: 36px; border-radius: 8px; text-align: center; vertical-align: middle;">
                          <span style="color: #ffffff; font-size: 20px; font-weight: bold; line-height: 36px; display: inline-block;">⚡</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <div style="color: #ffffff; font-size: 19px; font-weight: 800; letter-spacing: -0.5px; line-height: 22px;">RoleRadar</div>
                          <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.8px;">Personalized Alert Engine</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="background-color: rgba(37, 99, 235, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; display: inline-block;">
                      Daily Digest
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 28px 20px 28px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9;" class="mobile-padding">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0 0 8px 0; color: #0f172a; font-size: 21px; font-weight: 800; line-height: 28px;" class="mobile-title">
                      Hi ${data.recipientName || 'there'}, ${jobCountText}
                    </h1>
                    <p style="margin: 0 0 14px 0; color: #475569; font-size: 14px; line-height: 22px;">
                      We scanned thousands of listings over the past 24 hours. Here are the most relevant opportunities found for your criteria:
                    </p>
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="font-size: 12px; color: #64748b; font-weight: 500;">
                            <strong style="color: #334155;">Time Window:</strong>
                            <span style="color: #2563eb; font-weight: 600; margin-left: 4px;">${data.digestDateStr}</span> &bull; 
                            <span style="color: #334155;">${data.windowStr} IST</span>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 24px 10px 24px; background-color: #f8fafc;" class="mobile-padding">`;

  let text = `RoleRadar \u2014 New Job Matches\n\n${jobCountText}.\nDigest for ${data.digestDateStr} \u00b7 ${data.windowStr} IST\n\n`;

  const colors = [
    { bg: '#eff6ff', border: '#dbeafe', text: '#1e40af' },
    { bg: '#fdf2f8', border: '#fce7f3', text: '#be185d' },
    { bg: '#f0fdfa', border: '#ccfbf1', text: '#0f766e' },
    { bg: '#fef3c7', border: '#fde68a', text: '#b45309' },
  ];

  for (let i = 0; i < data.jobs.length; i++) {
    const job = data.jobs[i];
    const loc = job.location ? job.location : 'Any Location';
    const initials = (job.companyName || 'C').substring(0, 2).toUpperCase();
    const color = colors[i % colors.length];

    html += `
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 20px;" class="mobile-card">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="44" valign="top" style="padding-right: 14px;">
                          <div style="width: 44px; height: 44px; border-radius: 8px; background-color: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}; font-size: 16px; font-weight: 800; text-align: center; line-height: 44px;">
                            ${initials}
                          </div>
                        </td>
                        <td valign="top">
                          <div style="margin-bottom: 3px;">
                            <a href="${job.officialUrl}" class="job-card-link" style="color: #0f172a; font-size: 17px; font-weight: 700; text-decoration: none; line-height: 22px; display: inline-block;">
                              ${job.title}
                            </a>
                          </div>
                          <div style="color: #2563eb; font-size: 13px; font-weight: 600;">
                            ${job.companyName} <span style="color: #94a3b8; font-weight: 400;">&bull; ${job.sourceSystem || 'Direct'}</span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table border="0" cellpadding="0" cellspacing="0" style="margin-top: 14px; margin-bottom: 12px;">
                      <tr>
                        <td>
                          <span style="display: inline-block; background-color: #f1f5f9; color: #334155; font-size: 12px; font-weight: 500; padding: 4px 8px; border-radius: 6px; margin-right: 6px; margin-bottom: 4px;">
                            📍 ${loc}
                          </span>${job.workplaceType ? `
                          <span style="display: inline-block; background-color: #f1f5f9; color: #334155; font-size: 12px; font-weight: 500; padding: 4px 8px; border-radius: 6px; margin-right: 6px; margin-bottom: 4px;">
                            🏢 ${job.workplaceType}
                          </span>` : ''}${job.experience ? `
                          <span style="display: inline-block; background-color: #f1f5f9; color: #334155; font-size: 12px; font-weight: 500; padding: 4px 8px; border-radius: 6px; margin-right: 6px; margin-bottom: 4px;">
                            💼 ${job.experience}
                          </span>` : ''}
                        </td>
                      </tr>
                    </table>`;
                    
    if (job.matchSummary) {
      html += `
                    <p style="margin: 0 0 16px 0; color: #475569; font-size: 13px; line-height: 20px;">
                      ${job.matchSummary}
                    </p>`;
    }

    html += `
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-top: 10px; border-top: 1px solid #f1f5f9;">
                          <table border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td style="color: #94a3b8; font-size: 11px;">
                                RoleRadar Auto Alert
                              </td>
                              <td align="right" class="mobile-btn-wrapper">
                                <table border="0" cellpadding="0" cellspacing="0" class="mobile-btn-wrapper">
                                  <tr>
                                    <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                                      <a href="${job.officialUrl}" target="_blank" class="btn-apply mobile-btn" style="font-size: 13px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 8px 18px; border-radius: 6px; display: inline-block; border: 1px solid #2563eb;">
                                        Apply on Official Site &rarr;
                                      </a>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`;

    const metaParts = [loc];
    if (job.workplaceType) metaParts.push(job.workplaceType);
    if (job.experience) metaParts.push(job.experience);
    text += `* ${job.title} at ${job.companyName}\n  ${metaParts.join(' \u00b7 ')} \u00b7 Verified Genuine\n  Apply: ${job.officialUrl}\n\n`;
  }

  html += `
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 28px 24px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 20px;" class="mobile-padding">
              <div style="font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">RoleRadar Job Alerts</div>
              <div style="margin-bottom: 12px;">
                You are receiving this automated alert because you subscribed to RoleRadar notifications.
              </div>
              <div style="color: #64748b; font-size: 11px;">
                &copy; ${new Date().getFullYear()} RoleRadar. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
