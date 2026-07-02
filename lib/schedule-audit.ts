/**
 * Audit trail for schedule changes.
 *
 * Every schedule save posts the whole month as a blob, so — exactly like
 * validation — we diff the incoming month against what is stored and turn
 * each difference into an audit entry: who signed up, who was removed, and
 * whose hours changed, stamped with the acting user and time. The schedule
 * API persists these to the `scheduleAudit` Firestore collection after a
 * successful save; admins read them back through /api/admin/audit.
 *
 * Firestore rules deny all client access to the collection (server-only via
 * the Admin SDK), so entries cannot be forged or erased from the client.
 */

import {
  getHourlyAvailability,
  getMaxOfficersPerHour,
  type ShiftType,
} from '@/lib/schedule-utils';
import {
  readOfficers,
  slotDateFromId,
  shiftBounds,
  toOfficerShifts,
  ownsEntry,
  SUB_SLOT_KEYS,
  type RawSlot,
  type NormalizedOfficer,
} from '@/lib/schedule-validation';

export type ScheduleAuditAction = 'signup' | 'removal' | 'hours_change';

export interface ScheduleAuditActor {
  uid: string;
  name?: string;
  idNumber?: string;
  role?: string;
}

export interface ScheduleAuditEntry {
  action: ScheduleAuditAction;
  /** The officer whose shift entry changed (as it appears on the schedule). */
  officerName: string;
  slotId: string;
  slotType: ShiftType;
  /** Calendar day of the shift, "YYYY-MM-DD". */
  shiftDate: string;
  hoursBefore: string | null;
  hoursAfter: string | null;
  /** Who performed the change. */
  actorUid: string;
  actorName: string;
  actorIdNumber: string | null;
  actorRole: string;
  /** True when the actor changed their own entry (vs. an admin acting on someone else). */
  selfAction: boolean;
  /** True when this change pushed an hour past the STANDARD capacity for that day. */
  capacityOverride: boolean;
  month: number; // 0-indexed
  year: number;
  /** "YYYY-M" — single field so the admin API can query without a composite index. */
  monthKey: string;
  timestamp: string; // ISO
}

function toIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * True when, after the save, some hour covered by this officer exceeds the
 * standard (non-override) capacity for the day — i.e. the entry only exists
 * because an admin overrode the limit.
 */
function usesCapacityOverride(
  officer: NormalizedOfficer,
  newOfficers: NormalizedOfficer[],
  sub: RawSlot['morningSlot'],
  slotType: ShiftType,
  slotDate: Date
): boolean {
  const standardLimit = getMaxOfficersPerHour(slotDate);
  const { start, end } = shiftBounds(sub, slotType, slotDate);
  const shifts = toOfficerShifts(newOfficers, sub, slotType, slotDate);
  return getHourlyAvailability(shifts, start, end, standardLimit).some(
    (hour) =>
      hour.officerCount > standardLimit && hour.officers.includes(officer.name)
  );
}

export function buildScheduleAuditEntries(opts: {
  actor: ScheduleAuditActor;
  month: number; // 0-indexed
  year: number;
  incomingSchedule: unknown;
  existingSchedule: unknown;
  timestamp: string;
}): ScheduleAuditEntry[] {
  const { actor, month, year, incomingSchedule, existingSchedule, timestamp } = opts;
  if (!Array.isArray(incomingSchedule)) return [];

  const existingById = new Map<string, RawSlot>();
  if (Array.isArray(existingSchedule)) {
    for (const slot of existingSchedule as RawSlot[]) {
      if (slot && typeof slot.id === 'string') {
        existingById.set(slot.id, slot);
      }
    }
  }

  const base = {
    actorUid: actor.uid,
    actorName: actor.name || 'Unknown',
    actorIdNumber: actor.idNumber || null,
    actorRole: actor.role || 'user',
    month,
    year,
    monthKey: `${year}-${month}`,
    timestamp,
  };

  const entries: ScheduleAuditEntry[] = [];

  for (const rawSlot of incomingSchedule as RawSlot[]) {
    if (!rawSlot || typeof rawSlot !== 'object' || typeof rawSlot.id !== 'string') continue;
    const slotDate = slotDateFromId(rawSlot.id, year, month);
    const shiftDate = toIsoDay(slotDate);
    const existing = existingById.get(rawSlot.id);

    for (const slotType of ['morning', 'afternoon'] as const) {
      const sub = rawSlot[SUB_SLOT_KEYS[slotType]];
      const newOfficers = readOfficers(sub);
      const oldOfficers = readOfficers(existing?.[SUB_SLOT_KEYS[slotType]]);

      const oldByName = new Map(oldOfficers.map((o) => [o.name, o.hours]));
      const newNames = new Set(newOfficers.map((o) => o.name));
      const defaultHours = typeof sub?.time === 'string' ? sub.time : '';

      for (const officer of newOfficers) {
        const shared = {
          ...base,
          officerName: officer.name,
          slotId: rawSlot.id,
          slotType,
          shiftDate,
          selfAction: ownsEntry(officer.name, { idNumber: actor.idNumber, name: actor.name }),
          capacityOverride: usesCapacityOverride(officer, newOfficers, sub, slotType, slotDate),
        };
        if (!oldByName.has(officer.name)) {
          entries.push({
            ...shared,
            action: 'signup',
            hoursBefore: null,
            hoursAfter: officer.hours || defaultHours || null,
          });
        } else if (oldByName.get(officer.name) !== officer.hours) {
          entries.push({
            ...shared,
            action: 'hours_change',
            hoursBefore: oldByName.get(officer.name) || defaultHours || null,
            hoursAfter: officer.hours || defaultHours || null,
          });
        }
      }

      for (const officer of oldOfficers) {
        if (!newNames.has(officer.name)) {
          entries.push({
            ...base,
            action: 'removal',
            officerName: officer.name,
            slotId: rawSlot.id,
            slotType,
            shiftDate,
            hoursBefore: officer.hours || defaultHours || null,
            hoursAfter: null,
            selfAction: ownsEntry(officer.name, { idNumber: actor.idNumber, name: actor.name }),
            capacityOverride: false,
          });
        }
      }
    }
  }

  return entries;
}
