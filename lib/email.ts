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
const LOGO_URL = `${APP_URL}/logo-email.png`;
const NAVY = '#1e3a5f';

/**
 * Shared, email-client-safe (table-based) layout: department patch and name
 * in a navy header, white content card, quiet footer. Pass the inner content
 * as HTML; keep inline styles only.
 */
export function renderEmailLayout(contentHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#eef1f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e6ea;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="background-color:${NAVY};padding:28px 24px 22px;text-align:center;">
              <img src="${LOGO_URL}" alt="Cheverly Police Department" width="72" height="72" style="display:block;margin:0 auto 12px;border:0;" />
              <div style="color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:1px;">CHEVERLY POLICE DEPARTMENT</div>
              <div style="color:#aebdd2;font-size:12px;margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Metro Overtime Schedule</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background-color:#f6f8fa;border-top:1px solid #e2e6ea;text-align:center;">
              <div style="font-size:12px;color:#8a94a1;line-height:1.6;">
                Cheverly Police Department &middot; Metro Overtime Schedule<br />
                <a href="${APP_URL}" style="color:${NAVY};text-decoration:none;">schedule.cheverlypd.com</a>
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

/** Navy call-to-action button, centered. */
export function renderEmailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 0;">
    <tr>
      <td style="background-color:${NAVY};border-radius:6px;">
        <a href="${href}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
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
    <div style="font-size:11px;color:#8a94a1;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">${typeLabel} &middot; ${dateLabel}</div>
    <div style="font-size:20px;font-weight:bold;color:#1f2937;line-height:1.3;margin-bottom:18px;">${data.title}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${data.changes
        .map(
          (change) => `<tr>
        <td valign="top" style="padding:4px 10px 4px 0;color:${NAVY};font-size:14px;">&bull;</td>
        <td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.6;">${change}</td>
      </tr>`
        )
        .join('')}
    </table>
    ${renderEmailButton('Open the Schedule', `${APP_URL}/dashboard/schedule`)}
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

