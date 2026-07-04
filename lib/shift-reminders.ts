/**
 * Day-before shift reminder emails.
 *
 * A nightly cron (see /api/cron/shift-reminders) looks up tomorrow's
 * schedule, resolves each signed-up officer to their account email, and
 * sends one reminder per officer listing their shift block(s).
 */

import { adminDb } from '@/lib/firebase-admin';
import { sendEmail, renderEmailLayout, renderEmailButton } from '@/lib/email';

const APP_URL = 'https://schedule.cheverlypd.com';

export interface ReminderShift {
  period: 'Morning' | 'Afternoon';
  hours: string; // display form, e.g. "06:00–10:00"
}

export interface ShiftReminder {
  officerName: string;
  email: string | null; // null when no account matched the schedule entry
  idNumber: string | null;
  shifts: ReminderShift[];
}

/** Tomorrow's calendar day in Eastern time (anchored at noon to dodge DST). */
export function easternTomorrow(): { year: number; monthIndex: number; day: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const today = new Date(read('year'), read('month') - 1, read('day'), 12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    year: tomorrow.getFullYear(),
    monthIndex: tomorrow.getMonth(),
    day: tomorrow.getDate(),
    label: tomorrow.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

/** Parse "YYYY-MM-DD" into a reminder target (for admin testing on a specific day). */
export function targetFromDateString(
  dateStr: string
): { year: number; monthIndex: number; day: number; label: string } | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
    label: date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

/** "0600-1000" or "06:00-10:00" → "06:00–10:00" */
function displayHours(hours: string): string {
  const fmt = (t: string) => {
    const clean = t.trim();
    return clean.includes(':') ? clean : `${clean.slice(0, 2)}:${clean.slice(2)}`;
  };
  return hours
    .split(',')
    .map((range) => range.split('-').map(fmt).join('–'))
    .join(', ');
}

interface RawScheduleOfficer {
  name?: unknown;
  customHours?: unknown;
}
interface RawScheduleSubSlot {
  time?: unknown;
  officers?: unknown;
}
interface RawScheduleSlot {
  id?: unknown;
  morningSlot?: RawScheduleSubSlot;
  afternoonSlot?: RawScheduleSubSlot;
}

/**
 * Builds the reminder list for a calendar day from the stored schedule,
 * resolving officers to account emails via the "#<idNumber>" in their
 * schedule entry.
 */
export async function buildRemindersForDate(target: {
  year: number;
  monthIndex: number;
  day: number;
}): Promise<ShiftReminder[]> {
  const scheduleDoc = await adminDb()
    .collection('schedules')
    .doc(`${target.year}-${target.monthIndex}`)
    .get();
  if (!scheduleDoc.exists) return [];

  const schedule = (scheduleDoc.data()?.schedule ?? []) as RawScheduleSlot[];
  const slot = schedule.find(
    (s) => s && s.id === `${target.year}-${target.monthIndex}-${target.day}`
  );
  if (!slot) return [];

  const byOfficer = new Map<string, ShiftReminder>();

  const collect = (sub: RawScheduleSubSlot | undefined, period: 'Morning' | 'Afternoon') => {
    if (!sub || !Array.isArray(sub.officers)) return;
    const defaultTime = typeof sub.time === 'string' ? sub.time : '';
    for (const raw of sub.officers as RawScheduleOfficer[]) {
      if (!raw || typeof raw.name !== 'string') continue;
      const hours = typeof raw.customHours === 'string' && raw.customHours ? raw.customHours : defaultTime;
      const idMatch = raw.name.match(/#(\d+)/);
      const entry = byOfficer.get(raw.name) ?? {
        officerName: raw.name,
        email: null,
        idNumber: idMatch ? idMatch[1] : null,
        shifts: [],
      };
      entry.shifts.push({ period, hours: displayHours(hours) });
      byOfficer.set(raw.name, entry);
    }
  };

  collect(slot.morningSlot, 'Morning');
  collect(slot.afternoonSlot, 'Afternoon');

  const reminders = Array.from(byOfficer.values());

  // Resolve emails by idNumber
  for (const reminder of reminders) {
    if (!reminder.idNumber) continue;
    try {
      const snapshot = await adminDb()
        .collection('users')
        .where('idNumber', '==', reminder.idNumber)
        .limit(1)
        .get();
      const email = snapshot.docs[0]?.data()?.email;
      reminder.email = typeof email === 'string' && email ? email : null;
    } catch (error) {
      console.error(`Failed to resolve email for ${reminder.officerName}:`, error);
    }
  }

  return reminders;
}

/** Sends one day-before reminder email. Throws on transport errors. */
export async function sendShiftReminder(
  to: string,
  dayLabel: string,
  reminder: ShiftReminder
): Promise<void> {
  const shiftLines = reminder.shifts
    .map(
      (shift) =>
        `<div style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:4px;">&ndash;&nbsp;&nbsp;${shift.period} shift: <strong>${shift.hours}</strong></div>`
    )
    .join('');

  const content = `
    <div style="font-size:16px;font-weight:bold;color:#111827;line-height:1.4;margin-bottom:14px;">Metro overtime reminder</div>
    <div style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:12px;">You are scheduled to work Metro overtime tomorrow, <strong>${dayLabel}</strong>:</div>
    ${shiftLines}
    <div style="font-size:14px;color:#374151;line-height:1.7;margin-top:14px;">If you cannot work this shift, contact the Deputy Chief as soon as possible.</div>
    ${renderEmailButton('Open the schedule', `${APP_URL}/dashboard/schedule`)}
  `;

  await sendEmail({
    to,
    subject: `Shift Reminder — Metro overtime tomorrow (${dayLabel})`,
    htmlBody: renderEmailLayout(content),
    textBody: `
CHEVERLY POLICE DEPARTMENT — Metro Overtime Schedule

You are scheduled to work Metro overtime tomorrow, ${dayLabel}:

${reminder.shifts.map((shift) => `- ${shift.period} shift: ${shift.hours}`).join('\n')}

If you cannot work this shift, contact the Deputy Chief as soon as possible.

Open the schedule: ${APP_URL}/dashboard/schedule
    `.trim(),
  });
}
