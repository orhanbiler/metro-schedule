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
 *   - Per-hour capacity (3 on Mon/Fri, otherwise 2) is enforced for everyone.
 *
 * The window is evaluated in America/New_York so a server running in UTC
 * agrees with what officers see locally near day/month boundaries.
 */

import {
  parseTimeString,
  getHourlyAvailability,
  getMaxOfficersPerHour,
  getDefaultShiftWindow,
  type ShiftType,
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
interface RawSubSlot {
  time?: unknown;
  officers?: unknown;
}
interface RawSlot {
  id?: unknown;
  morningSlot?: RawSubSlot;
  afternoonSlot?: RawSubSlot;
}

interface NormalizedOfficer {
  name: string;
  hours: string;
}

const SUB_SLOT_KEYS = {
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

function readOfficers(sub: RawSubSlot | undefined): NormalizedOfficer[] {
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
function slotDateFromId(id: unknown, fallbackYear: number, fallbackMonth: number): Date {
  if (typeof id === 'string') {
    const match = id.match(/^(\d+)-(\d+)-(\d+)$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]), Number(match[3]), 12, 0, 0, 0);
    }
  }
  return new Date(fallbackYear, fallbackMonth, 1, 12, 0, 0, 0);
}

/** Officer names embed "#<idNumber>"; an officer owns only entries with their id. */
function ownsEntry(name: string, requester: ScheduleSaveRequester): boolean {
  if (requester.idNumber) {
    const escaped = requester.idNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`#${escaped}(?!\\d)`).test(name)) {
      return true;
    }
  }
  // Fallback for accounts stored without rank/id (name used verbatim).
  return Boolean(requester.name) && name === requester.name;
}

function shiftBounds(
  sub: RawSubSlot | undefined,
  slotType: ShiftType,
  slotDate: Date
): { start: string; end: string } {
  const time =
    typeof sub?.time === 'string' && sub.time.includes('-')
      ? sub.time
      : getDefaultShiftWindow(slotType, slotDate);
  const ranges = parseTimeString(time);
  let start = ranges[0]?.start ?? time.slice(0, 4);
  let end = ranges[0]?.end ?? time.slice(5, 9);
  for (const range of ranges) {
    if (range.start < start) start = range.start;
    if (range.end > end) end = range.end;
  }
  return { start, end };
}

function exceedsCapacity(
  officers: NormalizedOfficer[],
  sub: RawSubSlot | undefined,
  slotType: ShiftType,
  slotDate: Date
): boolean {
  const { start, end } = shiftBounds(sub, slotType, slotDate);
  const fallback = typeof sub?.time === 'string' ? sub.time : getDefaultShiftWindow(slotType, slotDate);
  const officerShifts = officers.map((officer) => {
    const ranges = parseTimeString(officer.hours || fallback);
    return {
      name: officer.name,
      timeRanges: ranges.length > 0 ? ranges : parseTimeString(getDefaultShiftWindow(slotType, slotDate)),
    };
  });
  const maxPerHour = getMaxOfficersPerHour(slotDate);
  return getHourlyAvailability(officerShifts, start, end, maxPerHour).some(
    (hour) => hour.officerCount > maxPerHour
  );
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

      if (gainedCoverage && exceedsCapacity(newOfficers, sub, slotType, slotDate)) {
        const limit = getMaxOfficersPerHour(slotDate);
        return {
          ok: false,
          status: 409,
          error: `That shift is full. A maximum of ${limit} officers per hour are allowed.`,
        };
      }
    }
  }

  return { ok: true };
}
