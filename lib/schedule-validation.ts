/**
 * Server-side validation for schedule saves.
 *
 * The schedule POST receives the entire month as a blob. Because the client
 * can't be trusted, we diff the incoming month against what's stored and
 * re-check the same business rules the UI enforces:
 *   - Regular officers may only add/remove THEMSELVES.
 *   - Additions must fall inside the officer's sign-up window (see
 *     getSignupWindowStatus); admins bypass the window.
 *   - Regular officers cannot touch past months at all.
 *   - Per-shift capacity (3 distinct officers on Mon/Fri, otherwise 2) is
 *     enforced for regular officers; admins may override up to a hard
 *     ceiling of 4 per shift. Only NEW violations are rejected, so a
 *     previously granted override (or data predating the per-shift rule)
 *     doesn't block later unrelated changes to the same shift.
 *
 * The window is evaluated in America/New_York so a server running in UTC
 * agrees with what officers see locally near day/month boundaries.
 */

import {
  countDistinctOfficers,
  getEffectiveMaxOfficersPerShift,
} from '@/lib/schedule-utils';
import { getSignupWindowStatus, normalizeAssignment } from '@/lib/assignments';

export interface ScheduleSaveRequester {
  uid: string;
  role?: string;
  idNumber?: string;
  name?: string;
  assignment?: unknown;
}

export interface ScheduleValidationResult {
  ok: boolean;
  status?: number;
  error?: string;
}

interface RawOfficer {
  name?: unknown;
  customHours?: unknown;
}
export interface RawSubSlot {
  time?: unknown;
  officers?: unknown;
}
export interface RawSlot {
  id?: unknown;
  morningSlot?: RawSubSlot;
  afternoonSlot?: RawSubSlot;
}

export interface NormalizedOfficer {
  name: string;
  hours: string;
}

export const SUB_SLOT_KEYS = {
  morning: 'morningSlot',
  afternoon: 'afternoonSlot',
} as const;

/** Current date in Eastern time, anchored at noon to dodge DST/midnight edges. */
function easternNow(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(read('year'), read('month') - 1, read('day'), 12, 0, 0, 0);
}

export function readOfficers(sub: RawSubSlot | undefined): NormalizedOfficer[] {
  if (!sub || !Array.isArray(sub.officers)) return [];
  const result: NormalizedOfficer[] = [];
  for (const raw of sub.officers as RawOfficer[]) {
    if (raw && typeof raw.name === 'string') {
      result.push({
        name: raw.name,
        hours: typeof raw.customHours === 'string' ? raw.customHours : '',
      });
    }
  }
  return result;
}

/** Reconstruct the calendar day from the slot id ("YYYY-M-D", month 0-indexed). */
export function slotDateFromId(id: unknown, fallbackYear: number, fallbackMonth: number): Date {
  if (typeof id === 'string') {
    const match = id.match(/^(\d+)-(\d+)-(\d+)$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]), Number(match[3]), 12, 0, 0, 0);
    }
  }
  return new Date(fallbackYear, fallbackMonth, 1, 12, 0, 0, 0);
}

/** Officer names embed "#<idNumber>"; an officer owns only entries with their id. */
export function ownsEntry(
  name: string,
  requester: Pick<ScheduleSaveRequester, 'idNumber' | 'name'>
): boolean {
  if (requester.idNumber) {
    const escaped = requester.idNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`#${escaped}(?!\\d)`).test(name)) {
      return true;
    }
  }
  // Fallback for accounts stored without rank/id (name used verbatim).
  return Boolean(requester.name) && name === requester.name;
}

/**
 * True when the save pushes the shift's distinct-officer count over
 * `maxPerShift` AND the shift got more crowded than it already was.
 * Pre-existing over-capacity (a previously granted admin override, or data
 * saved under the old per-hour rules) is grandfathered so it doesn't block
 * unrelated changes to the same shift.
 */
function introducesCapacityViolation(
  oldOfficers: NormalizedOfficer[],
  newOfficers: NormalizedOfficer[],
  maxPerShift: number
): boolean {
  const before = countDistinctOfficers(oldOfficers);
  const after = countDistinctOfficers(newOfficers);
  return after > maxPerShift && after > before;
}

export function validateScheduleSave(opts: {
  requester: ScheduleSaveRequester;
  month: number; // 0-indexed
  year: number;
  incomingSchedule: unknown;
  existingSchedule: unknown;
}): ScheduleValidationResult {
  const { requester, month, year, incomingSchedule, existingSchedule } = opts;
  const isAdmin = requester.role === 'admin';

  if (!Array.isArray(incomingSchedule)) {
    return { ok: false, status: 400, error: 'Invalid schedule payload.' };
  }

  const existingById = new Map<string, RawSlot>();
  if (Array.isArray(existingSchedule)) {
    for (const slot of existingSchedule as RawSlot[]) {
      if (slot && typeof slot.id === 'string') {
        existingById.set(slot.id, slot);
      }
    }
  }

  const now = easternNow();
  const windowStatus = getSignupWindowStatus(now, month, year, normalizeAssignment(requester.assignment));
  const targetIdx = year * 12 + month;
  const isPastMonth = targetIdx < now.getFullYear() * 12 + now.getMonth();

  for (const rawSlot of incomingSchedule as RawSlot[]) {
    if (!rawSlot || typeof rawSlot !== 'object') continue;
    const slotDate = slotDateFromId(rawSlot.id, year, month);
    const existing =
      typeof rawSlot.id === 'string' ? existingById.get(rawSlot.id) : undefined;

    for (const slotType of ['morning', 'afternoon'] as const) {
      const sub = rawSlot[SUB_SLOT_KEYS[slotType]];
      const newOfficers = readOfficers(sub);
      const oldOfficers = readOfficers(existing?.[SUB_SLOT_KEYS[slotType]]);

      const oldByName = new Map(oldOfficers.map((o) => [o.name, o.hours]));
      const newNames = new Set(newOfficers.map((o) => o.name));

      const added = newOfficers.filter((o) => !oldByName.has(o.name));
      const modified = newOfficers.filter(
        (o) => oldByName.has(o.name) && oldByName.get(o.name) !== o.hours
      );
      const removed = oldOfficers.filter((o) => !newNames.has(o.name));
      const gainedCoverage = added.length > 0 || modified.length > 0;

      if (added.length === 0 && modified.length === 0 && removed.length === 0) {
        continue;
      }

      if (!isAdmin) {
        if (isPastMonth) {
          return { ok: false, status: 403, error: 'Past months cannot be modified.' };
        }
        // Regular officers cannot remove anyone (including themselves) — only
        // admins can remove an officer from a shift.
        if (removed.length > 0) {
          return {
            ok: false,
            status: 403,
            error: 'Only an administrator can remove an officer from a shift.',
          };
        }
        // Can't sign up for a shift on a day that has already passed.
        if (added.length > 0 && slotDate.getTime() < now.getTime()) {
          return {
            ok: false,
            status: 403,
            error: 'You cannot sign up for a shift that has already passed.',
          };
        }
        // They may only add/adjust their own sign-up.
        for (const officer of [...added, ...modified]) {
          if (!ownsEntry(officer.name, requester)) {
            return {
              ok: false,
              status: 403,
              error: 'You can only add yourself to shifts.',
            };
          }
        }
        if (gainedCoverage && !windowStatus.canSignUp) {
          return { ok: false, status: 403, error: windowStatus.message };
        }
      }

      if (gainedCoverage) {
        // Admins may exceed the standard capacity, but never the override ceiling.
        const limit = getEffectiveMaxOfficersPerShift(slotDate, isAdmin);
        if (introducesCapacityViolation(oldOfficers, newOfficers, limit)) {
          return {
            ok: false,
            status: 409,
            error: `That shift is full. A maximum of ${limit} officers may work this shift.`,
          };
        }
      }
    }
  }

  return { ok: true };
}
