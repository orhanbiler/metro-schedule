/**
 * Department assignment groups and the overtime sign-up window rules.
 *
 * Sign-up window (for the FOLLOWING month only):
 *   - Days  1–19 of the current month: closed for everyone (regular users).
 *   - Days 20–24: open to PATROL only (Patrol has first priority).
 *   - Days 25–end of month: open to everyone (Patrol keeps its access).
 * The window closes when the target month begins: officers schedule their
 * entire month in advance, and once a month starts its remaining shifts are
 * LOCKED — no last-minute self sign-ups. The current month, past months, and
 * months beyond the following month are not self-signable by regular users.
 * Admins bypass all of these rules.
 */

export const ASSIGNMENTS = [
  'Patrol',
  'CID',
  'Automated Enforcement',
  'Administration',
] as const;

export type Assignment = (typeof ASSIGNMENTS)[number];

/** Existing/unset users are treated as Patrol until an admin changes it. */
export const DEFAULT_ASSIGNMENT: Assignment = 'Patrol';

/**
 * Emergency kill switch: when true, self sign-ups are suspended for ALL
 * months and assignments (admins are unaffected — they bypass the window).
 * Flip back to false and redeploy to restore normal window behavior.
 */
export const SIGNUPS_SUSPENDED = true;

/** Day of the month Patrol's exclusive priority window opens. */
export const PATROL_WINDOW_OPEN_DAY = 20;
/** Day of the month sign-ups open to all other assignments. */
export const GENERAL_WINDOW_OPEN_DAY = 25;

export function isValidAssignment(value: unknown): value is Assignment {
  return typeof value === 'string' && (ASSIGNMENTS as readonly string[]).includes(value);
}

/** Coerce any stored/missing value into a valid assignment (defaults to Patrol). */
export function normalizeAssignment(value: unknown): Assignment {
  return isValidAssignment(value) ? value : DEFAULT_ASSIGNMENT;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type SignupWindowReason =
  | 'open'              // user may sign up right now
  | 'before-window'     // following month, but before the 20th
  | 'patrol-priority'   // following month, days 20–24, user is non-Patrol
  | 'future-month'      // a month beyond the following month
  | 'month-locked'      // the month already began; remaining shifts are locked
  | 'suspended'         // sign-ups temporarily suspended department-wide
  | 'closed';           // a past month

export interface SignupWindowStatus {
  canSignUp: boolean;
  reason: SignupWindowReason;
  message: string;
}

/** Whole-month index so month math survives year boundaries. */
const monthIndex = (year: number, month: number): number => year * 12 + month;

/**
 * Determine whether a regular user with the given assignment may sign up for
 * the target month/year as of `now`. `targetMonth` is 0-indexed (Jan = 0).
 */
export function getSignupWindowStatus(
  now: Date,
  targetMonth: number,
  targetYear: number,
  assignment: Assignment
): SignupWindowStatus {
  if (SIGNUPS_SUSPENDED) {
    return {
      canSignUp: false,
      reason: 'suspended',
      message:
        'Shift sign-ups are temporarily suspended. Contact the Deputy Chief with any questions.',
    };
  }

  const nowIdx = monthIndex(now.getFullYear(), now.getMonth());
  const targetIdx = monthIndex(targetYear, targetMonth);
  const diff = targetIdx - nowIdx;
  const day = now.getDate();
  const currentMonthName = MONTH_NAMES[now.getMonth()];
  const targetMonthName = MONTH_NAMES[targetMonth];

  // Past month: closed to everyone.
  if (diff < 0) {
    return {
      canSignUp: false,
      reason: 'closed',
      message: `The sign-up window for ${targetMonthName} ${targetYear} has closed.`,
    };
  }

  // Current month: the sign-up window closed when the month began. Officers
  // schedule their entire month during the advance window; remaining shifts
  // are locked and only an administrator can make changes.
  if (diff === 0) {
    return {
      canSignUp: false,
      reason: 'month-locked',
      message: `Sign-ups for ${targetMonthName} ${targetYear} closed when the month began. Contact the Deputy Chief if you need to be added to or removed from a shift.`,
    };
  }

  // Beyond the following month: not open yet.
  if (diff >= 2) {
    // The window for the target month opens on the 20th of the month before it.
    const openMonth = targetMonth === 0 ? 11 : targetMonth - 1;
    return {
      canSignUp: false,
      reason: 'future-month',
      message: `Sign-ups for ${targetMonthName} ${targetYear} aren't open yet. They open ${MONTH_NAMES[openMonth]} ${PATROL_WINDOW_OPEN_DAY}.`,
    };
  }

  // diff === 1: the following month — the window applies.
  if (day < PATROL_WINDOW_OPEN_DAY) {
    return {
      canSignUp: false,
      reason: 'before-window',
      message: `Sign-ups for ${targetMonthName} open ${currentMonthName} ${PATROL_WINDOW_OPEN_DAY} for Patrol and ${currentMonthName} ${GENERAL_WINDOW_OPEN_DAY} for those assigned to specialized units.`,
    };
  }

  if (assignment === 'Patrol' || day >= GENERAL_WINDOW_OPEN_DAY) {
    return {
      canSignUp: true,
      reason: 'open',
      message: `Sign-ups for ${targetMonthName} ${targetYear} are open.`,
    };
  }

  // Non-Patrol during the Patrol-priority window (days 20–24).
  return {
    canSignUp: false,
    reason: 'patrol-priority',
    message: `Patrol officers have first priority until ${currentMonthName} ${GENERAL_WINDOW_OPEN_DAY}. Sign-ups open to your assignment (${assignment}) on ${currentMonthName} ${GENERAL_WINDOW_OPEN_DAY}.`,
  };
}
