/**
 * Department assignment groups and the overtime sign-up window rules.
 *
 * Sign-up window (for the FOLLOWING month only):
 *   - Days  1–19 of the current month: closed for everyone (regular users).
 *   - Days 20–24: open to PATROL only (Patrol has first priority).
 *   - Days 25–end of month: open to everyone (Patrol keeps its access).
 * The current month and any month beyond the following month are not
 * self-signable by regular users. Admins bypass all of these rules.
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

  // Current month: any shift still open is first-come, first-served for
  // everyone. Patrol priority only applied to the advance window, so once the
  // month begins, remaining shifts are open to all assignments.
  if (diff === 0) {
    return {
      canSignUp: true,
      reason: 'open',
      message: `Sign-ups for ${targetMonthName} ${targetYear} are open — remaining shifts are first-come, first-served.`,
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
