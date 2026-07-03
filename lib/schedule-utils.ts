/**
 * Utility functions for managing schedule with per-shift officer limits.
 *
 * Capacity is counted per SHIFT (morning / evening), not per hour: no more
 * than N distinct officers may sign up for a shift, regardless of whether
 * their blocks overlap. (Previously capacity was per hour, which allowed
 * e.g. 2 officers on 0600-0800 plus 2 more on 0800-1200.)
 */

export type ShiftType = 'morning' | 'afternoon';

export interface TimeRange {
  start: string; // Format: "HHMM" (e.g., "0500")
  end: string;   // Format: "HHMM" (e.g., "1300")
}

export interface OfficerShift {
  name: string;
  timeRanges: TimeRange[]; // Support for split shifts
}

const policyDate = new Date('2025-11-19T00:00:00');
policyDate.setHours(0, 0, 0, 0);

export const SHIFT_POLICY_EFFECTIVE_DATE = policyDate;

const SHIFT_WINDOWS = {
  legacy: {
    morning: '0500-1300',
    afternoon: '1300-2200',
    maxBlockMinutes: null as number | null,
  },
  updated: {
    morning: '0600-1200',
    afternoon: '1400-2000',
    maxBlockMinutes: 4 * 60,
  },
} as const;

const startOfDay = (value: Date): number => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Per-shift officer capacity. Mondays and Fridays allow a third officer. */
export const DEFAULT_MAX_OFFICERS_PER_SHIFT = 2;
export const PEAK_MAX_OFFICERS_PER_SHIFT = 3;

/**
 * Hard ceiling when an admin overrides the standard capacity for one-off
 * situations (e.g. a 3rd officer on a Tue–Thu shift, or a 4th when it
 * genuinely happened). Overrides can never stack beyond this.
 */
export const ADMIN_OVERRIDE_MAX_OFFICERS_PER_SHIFT = 4;

/** Minimum length of a sign-up block. */
export const MIN_SHIFT_BLOCK_MINUTES = 2 * 60;

export const getMaxOfficersPerShift = (slotDate: Date): number => {
  const day = slotDate.getDay(); // 0 = Sunday … 1 = Monday … 5 = Friday
  return day === 1 || day === 5 ? PEAK_MAX_OFFICERS_PER_SHIFT : DEFAULT_MAX_OFFICERS_PER_SHIFT;
};

/**
 * Capacity that applies to a specific requester: admins may exceed the
 * standard limit up to the override ceiling; everyone else gets the standard
 * limit for that day.
 */
export const getEffectiveMaxOfficersPerShift = (slotDate: Date, isAdmin: boolean): number => {
  const base = getMaxOfficersPerShift(slotDate);
  return isAdmin ? Math.max(base, ADMIN_OVERRIDE_MAX_OFFICERS_PER_SHIFT) : base;
};

/** Number of distinct officers signed up (duplicate names counted once). */
export const countDistinctOfficers = (officers: { name: string }[]): number => {
  return new Set(officers.map((officer) => officer.name)).size;
};

export const usesUpdatedShiftPolicy = (slotDate: Date): boolean => {
  return startOfDay(slotDate) >= SHIFT_POLICY_EFFECTIVE_DATE.getTime();
};

export const getDefaultShiftWindow = (slotType: ShiftType, slotDate: Date): string => {
  const rules = usesUpdatedShiftPolicy(slotDate) ? SHIFT_WINDOWS.updated : SHIFT_WINDOWS.legacy;
  return slotType === 'morning' ? rules.morning : rules.afternoon;
};

export const getShiftMaxBlockMinutes = (slotDate: Date): number | null => {
  const rules = usesUpdatedShiftPolicy(slotDate) ? SHIFT_WINDOWS.updated : SHIFT_WINDOWS.legacy;
  return rules.maxBlockMinutes;
};

export const getShiftTimeOrDefault = (
  slotDate: Date,
  slotType: ShiftType,
  providedTime?: string
): string => {
  if (providedTime && providedTime.includes('-')) {
    return providedTime;
  }
  return getDefaultShiftWindow(slotType, slotDate);
};

export const getShiftStartHour = (
  slotDate: Date,
  slotType: ShiftType,
  providedTime?: string
): number => {
  const timeString = getShiftTimeOrDefault(slotDate, slotType, providedTime);
  const [start] = timeString.split('-');
  const normalized = start.replace(/:/g, '').padEnd(4, '0');
  const parsed = parseInt(normalized.slice(0, 2), 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return parseInt(getDefaultShiftWindow(slotType, slotDate).slice(0, 2), 10);
};

/**
 * Parse time string formats like "0500-1300", "05:00-13:00", or "0500-1000,1100-1300" (split shift)
 */
export function parseTimeString(timeString: string): TimeRange[] {
  const ranges: TimeRange[] = [];
  const parts = timeString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    // Try format without colons first (e.g., "0500-1300")
    let match = part.match(/^(\d{4})-(\d{4})$/);
    if (match) {
      ranges.push({
        start: match[1],
        end: match[2]
      });
      continue;
    }
    
    // Try format with colons (e.g., "05:00-13:00")
    match = part.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (match) {
      ranges.push({
        start: match[1] + match[2],
        end: match[3] + match[4]
      });
    }
  }
  
  return ranges;
}

/**
 * Convert HHMM format to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const hours = parseInt(time.substring(0, 2));
  const minutes = parseInt(time.substring(2, 4));
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HHMM format
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours.toString().padStart(2, '0') + mins.toString().padStart(2, '0');
}

export const addMinutesToTimeString = (time: string, minutesToAdd: number): string => {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
};

export const getTimeRangeDurationMinutes = (range: TimeRange): number => {
  return timeToMinutes(range.end) - timeToMinutes(range.start);
};

export const isRangeWithinShiftWindow = (
  range: TimeRange,
  shiftStart: string,
  shiftEnd: string
): boolean => {
  return range.start >= shiftStart && range.end <= shiftEnd;
};

/**
 * Validate if a new officer shift can be added
 */
export function canAddOfficerShift(
  existingOfficers: OfficerShift[],
  newOfficerName: string,
  newTimeRanges: TimeRange[],
  shiftStart: string,
  shiftEnd: string,
  maxPerShift: number = DEFAULT_MAX_OFFICERS_PER_SHIFT
): { valid: boolean; conflicts: string[] } {
  // Check minimum shift length
  for (const range of newTimeRanges) {
    const duration = timeToMinutes(range.end) - timeToMinutes(range.start);
    if (duration < MIN_SHIFT_BLOCK_MINUTES) {
      return {
        valid: false,
        conflicts: [`Each shift block must be at least ${MIN_SHIFT_BLOCK_MINUTES / 60} hours long`]
      };
    }
  }

  // Check if time ranges are within shift bounds
  const shiftStartMin = timeToMinutes(shiftStart);
  const shiftEndMin = timeToMinutes(shiftEnd);

  for (const range of newTimeRanges) {
    const rangeStart = timeToMinutes(range.start);
    const rangeEnd = timeToMinutes(range.end);

    if (rangeStart < shiftStartMin || rangeEnd > shiftEndMin) {
      return {
        valid: false,
        conflicts: [`Time must be within shift hours (${shiftStart}-${shiftEnd})`]
      };
    }
  }

  // Per-shift capacity: count distinct officers, overlap doesn't matter.
  const distinctNames = new Set(existingOfficers.map((officer) => officer.name));
  if (!distinctNames.has(newOfficerName) && distinctNames.size >= maxPerShift) {
    return {
      valid: false,
      conflicts: [`This shift is full. A maximum of ${maxPerShift} officers may work this shift.`]
    };
  }

  return { valid: true, conflicts: [] };
}

/**
 * Format time ranges for display
 */
export function formatTimeRanges(ranges: TimeRange[]): string {
  return ranges.map(r => `${r.start}-${r.end}`).join(', ');
}

/**
 * Get available time slots for a shift.
 *
 * With per-shift capacity, an incoming officer may pick any block inside the
 * window (overlap with existing officers is fine), so the whole window is
 * open while the shift has room and nothing is open once it is full.
 */
export function getAvailableTimeSlots(
  officers: OfficerShift[],
  shiftStart: string,
  shiftEnd: string,
  maxPerShift: number = DEFAULT_MAX_OFFICERS_PER_SHIFT
): string[] {
  if (timeToMinutes(shiftStart) >= timeToMinutes(shiftEnd)) {
    return [];
  }
  return countDistinctOfficers(officers) < maxPerShift ? [`${shiftStart}-${shiftEnd}`] : [];
}

/**
 * Get concrete start/end Date objects for a shift based on its time string
 */
export function getShiftDateBounds(
  slotDate: Date,
  timeString: string
): { start: Date | null; end: Date | null } {
  if (!timeString) {
    return { start: null, end: null };
  }

  const ranges = parseTimeString(timeString);
  if (ranges.length === 0) {
    return { start: null, end: null };
  }

  const toMinutes = (value: string): number => {
    const hours = parseInt(value.slice(0, 2), 10);
    const minutes = parseInt(value.slice(2, 4), 10);
    return hours * 60 + minutes;
  };

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;

  for (const range of ranges) {
    const startMinutes = toMinutes(range.start);
    const endMinutes = toMinutes(range.end);

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      continue;
    }

    if (startMinutes < minStart) {
      minStart = startMinutes;
    }

    if (endMinutes > maxEnd) {
      maxEnd = endMinutes;
    }
  }

  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    return { start: null, end: null };
  }

  // Handle overnight shifts that wrap past midnight
  if (maxEnd <= minStart) {
    maxEnd += 24 * 60;
  }

  const createDateFromMinutes = (minutes: number): Date => {
    const result = new Date(slotDate);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes, 0, 0);
    return result;
  };

  return {
    start: createDateFromMinutes(minStart),
    end: createDateFromMinutes(maxEnd),
  };
}
