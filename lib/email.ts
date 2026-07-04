/**
 * Email transport: Brevo transactional API (https://developers.brevo.com).
 * Requires BREVO_API_KEY. The sender must be verified in Brevo
 * (Senders & Domains); override the default with EMAIL_FROM.
 */
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM_EMAIL = process.env.EMAIL_FROM || 'notifications@schedule.cheverlypd.com';
const FROM_NAME = 'Cheverly PD Metro';

export interface SendEmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/** Sends one transactional email through Brevo. Throws on API errors. */
export async function sendEmail(payload: SendEmailPayload): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not set. Email notifications are disabled.');
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.htmlBody,
      textContent: payload.textBody,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo API error ${response.status}: ${detail}`);
  }
}

const APP_URL = 'https://schedule.cheverlypd.com';
const NAVY = '#1e3a5f';

/**
 * Plain, letterhead-style layout: the department name over a navy rule, the
 * content as simple text, a quiet one-line footer. No card, no images (email
 * clients block remote images by default), no marketing chrome.
 */
export function renderEmailLayout(contentHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
          <tr>
            <td style="padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
              <div style="border-bottom:3px solid ${NAVY};padding-bottom:14px;margin-bottom:26px;">
                <div style="font-size:16px;font-weight:bold;color:${NAVY};letter-spacing:1px;">CHEVERLY POLICE DEPARTMENT</div>
                <div style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Metro Overtime Schedule</div>
              </div>
              ${contentHtml}
              <div style="border-top:1px solid #d7dce2;margin-top:30px;padding-top:12px;font-size:11px;color:#9aa3ad;">
                Cheverly Police Department &middot; <a href="${APP_URL}" style="color:#9aa3ad;">schedule.cheverlypd.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain navy text link, letter style — no button chrome. */
export function renderEmailButton(label: string, href: string): string {
  return `<div style="margin-top:22px;font-size:14px;">
    <a href="${href}" style="color:${NAVY};font-weight:bold;">${label} &rarr;</a>
  </div>`;
}

export interface ChangelogNotificationData {
  title: string;
  changes: string[];
  type: string;
  date: string;
}

export async function sendChangelogNotification(
  to: string,
  data: ChangelogNotificationData
) {
  const typeLabel = getTypeLabel(data.type);
  const dateLabel = new Date(data.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const content = `
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;">${dateLabel} &middot; ${typeLabel}</div>
    <div style="font-size:18px;font-weight:bold;color:#111827;line-height:1.35;margin-bottom:14px;">${data.title}</div>
    ${data.changes
      .map(
        (change) =>
          `<div style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:4px;">&ndash;&nbsp;&nbsp;${change}</div>`
      )
      .join('')}
    ${renderEmailButton('Open the schedule', `${APP_URL}/dashboard/schedule`)}
  `;

  try {
    await sendEmail({
      to,
      subject: `${typeLabel}: ${data.title} — Cheverly PD Metro`,
      htmlBody: renderEmailLayout(content),
      textBody: `
CHEVERLY POLICE DEPARTMENT — Metro Overtime Schedule

${typeLabel} — ${dateLabel}
${data.title}

${data.changes.map((change) => `• ${change}`).join('\n')}

Open the schedule: ${APP_URL}/dashboard/schedule
      `.trim(),
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send changelog notification:', error);
    return { success: false, error };
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'feature':
      return 'New Feature';
    case 'improvement':
      return 'Improvement';
    case 'fix':
      return 'Bug Fix';
    case 'security':
      return 'Security Update';
    case 'update':
      return 'Update';
    case 'maintenance':
      return 'Maintenance';
    case 'performance':
      return 'Performance';
    case 'ui':
      return 'UI/UX Update';
    case 'breaking':
      return 'Breaking Change';
    default:
      return 'Update';
  }
}

