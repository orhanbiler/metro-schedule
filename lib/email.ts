type PostmarkClient = {
  sendEmail: (payload: {
    From: string;
    To: string;
    Subject: string;
    HtmlBody: string;
    TextBody?: string;
  }) => Promise<unknown>;
};

let cachedClient: PostmarkClient | null = null;
let clientPromise: Promise<PostmarkClient | null> | null = null;

async function loadPostmarkClient(): Promise<PostmarkClient | null> {
  if (cachedClient) {
    return cachedClient;
  }

  if (!process.env.POSTMARK_SERVER_TOKEN) {
    console.warn('POSTMARK_SERVER_TOKEN is not set. Email notifications are disabled.');
    return null;
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const postmarkModule = (await import('postmark')) as {
          Client?: new (token: string) => PostmarkClient;
          ServerClient?: new (token: string) => PostmarkClient;
        };

        const ClientCtor = postmarkModule.Client ?? postmarkModule.ServerClient;

        if (!ClientCtor) {
          console.warn('Postmark client constructor not found. Email notifications are disabled.');
          return null;
        }

        cachedClient = new ClientCtor(process.env.POSTMARK_SERVER_TOKEN!);
        return cachedClient;
      } catch (error) {
        console.warn('Postmark package not available. Email notifications are disabled.', error);
        return null;
      }
    })();
  }

  if (!clientPromise) {
    return null;
  }

  cachedClient = await clientPromise;
  return cachedClient;
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
  const client = await loadPostmarkClient();

  if (!client) {
    const error = new Error('Postmark client unavailable');
    console.warn('Skipping changelog notification: Postmark client unavailable');
    return { success: false, error };
  }
  
  try {
    await client.sendEmail({
      From: 'notifications@schedule.cheverlypd.com',
      To: to,
      Subject: `${typeLabel}: ${data.title} - Cheverly PD Metro`,
      HtmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cheverly PD Metro - What's New</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: bold;">Cheverly PD Metro</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 16px;">What's New</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px;">
              <div style="margin-bottom: 16px;">
                <span style="display: inline-block; padding: 4px 12px; background-color: ${getTypeBadgeColor(data.type)}; color: white; border-radius: 16px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                  ${typeLabel}
                </span>
              </div>
              
              <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 20px; line-height: 1.2;">
                ${data.title}
              </h2>
              
              <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
                ${new Date(data.date).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
              
              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 16px;">Changes:</h3>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.6;">
                  ${data.changes.map(change => `<li style="margin-bottom: 8px;">${change}</li>`).join('')}
                </ul>
              </div>
              
              <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <a href="https://schedule.cheverlypd.com/dashboard" 
                   style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
                  View in Application
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                This notification was sent from Cheverly PD Metro Schedule System.
                <br>
                <a href="https://schedule.cheverlypd.com" style="color: #3b82f6;">schedule.cheverlypd.com</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      TextBody: `
Cheverly PD Metro - What's New

${typeLabel}: ${data.title}
Date: ${new Date(data.date).toLocaleDateString('en-US', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

Changes:
${data.changes.map(change => `• ${change}`).join('\n')}

View the full update at: https://schedule.cheverlypd.com/dashboard

---
This notification was sent from Cheverly PD Metro Schedule System.
Visit: https://schedule.cheverlypd.com
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

function getTypeBadgeColor(type: string): string {
  switch (type) {
    case 'feature':
    case 'update':
    case 'ui':
      return '#3b82f6'; // Blue
    case 'improvement':
    case 'maintenance':
    case 'performance':
      return '#6b7280'; // Gray
    case 'fix':
      return '#10b981'; // Green
    case 'security':
    case 'breaking':
      return '#ef4444'; // Red
    default:
      return '#3b82f6'; // Blue
  }
}
