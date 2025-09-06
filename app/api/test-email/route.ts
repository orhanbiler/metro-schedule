import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { sendChangelogNotification } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Send test email with sample changelog data
    const testChangelogData = {
      title: 'Test Email Notification System',
      changes: [
        'Added email notifications for changelog updates',
        'Created professional email templates with Cheverly PD Metro branding',
        'Integrated with Postmark email service',
        'Added responsive design for mobile devices'
      ],
      type: 'feature',
      date: new Date().toISOString(),
    };

    const result = await sendChangelogNotification(email, testChangelogData);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: `Test email sent successfully to ${email}` 
      });
    } else {
      return NextResponse.json({ 
        error: 'Failed to send test email',
        details: result.error 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json({ 
      error: 'Failed to send test email',
      details: error 
    }, { status: 500 });
  }
}