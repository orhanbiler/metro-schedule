import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import {
  buildRemindersForDate,
  easternTomorrow,
  sendShiftReminder,
  targetFromDateString,
} from '@/lib/shift-reminders';

/**
 * Day-before shift reminders. Invoked two ways:
 *  - Vercel Cron (nightly): authorized via the CRON_SECRET bearer token that
 *    Vercel attaches automatically when the env var is set.
 *  - An admin (manual test): authorized via their session.
 *
 * Query params:
 *  - dryRun=1        → report who WOULD receive what; send nothing.
 *  - overrideEmail=x → send every reminder to this address instead of the
 *                      officers (for verifying the real email end-to-end).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isCron) {
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true';
  const overrideEmail = searchParams.get('overrideEmail')?.trim() || null;
  // ?date=YYYY-MM-DD lets admins test against any day (e.g. one with sign-ups)
  const dateParam = searchParams.get('date');

  try {
    const target = (dateParam && targetFromDateString(dateParam)) || easternTomorrow();
    const reminders = await buildRemindersForDate(target);

    const results: Array<{
      officer: string;
      email: string | null;
      shifts: string[];
      status: 'sent' | 'skipped-no-email' | 'failed' | 'dry-run';
    }> = [];

    for (const reminder of reminders) {
      const shifts = reminder.shifts.map((s) => `${s.period} ${s.hours}`);
      if (dryRun) {
        results.push({ officer: reminder.officerName, email: reminder.email, shifts, status: 'dry-run' });
        continue;
      }
      const recipient = overrideEmail ?? reminder.email;
      if (!recipient) {
        results.push({ officer: reminder.officerName, email: null, shifts, status: 'skipped-no-email' });
        continue;
      }
      try {
        await sendShiftReminder(recipient, target.label, reminder);
        results.push({ officer: reminder.officerName, email: recipient, shifts, status: 'sent' });
      } catch (error) {
        console.error(`Shift reminder failed for ${reminder.officerName}:`, error);
        results.push({ officer: reminder.officerName, email: recipient, shifts, status: 'failed' });
      }
    }

    return NextResponse.json({
      date: target.label,
      dryRun,
      overrideEmail,
      count: reminders.length,
      sent: results.filter((r) => r.status === 'sent').length,
      results,
    });
  } catch (error) {
    console.error('Shift reminder run failed:', error);
    return NextResponse.json({ error: 'Shift reminder run failed' }, { status: 500 });
  }
}
