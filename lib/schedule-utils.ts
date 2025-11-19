/**
 * Utility functions for managing schedule with hourly officer limits
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

export interface HourlyAvailability {
  hour: string; // Format: "HHMM"
  officerCount: number;
  officers: string[];
  available: boolean;
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
 * Get hourly availability for a shift
 */
export function getHourlyAvailability(
  officers: OfficerShift[], 
  shiftStart: string, 
  shiftEnd: string
): HourlyAvailability[] {
  const availability: HourlyAvailability[] = [];
  const startMinutes = timeToMinutes(shiftStart);
  const endMinutes = timeToMinutes(shiftEnd);
  
  // Create hourly slots
  for (let minutes = startMinutes; minutes < endMinutes; minutes += 60) {
    const hour = minutesToTime(minutes);
    const hourEnd = minutes + 60;
    
    // Count officers working during this hour
    const workingOfficers: string[] = [];
    
    for (const officer of officers) {
      for (const range of officer.timeRanges) {
        const rangeStart = timeToMinutes(range.start);
        const rangeEnd = timeToMinutes(range.end);
        
        // Check if officer is working during this hour
        if (rangeStart < hourEnd && rangeEnd > minutes) {
          workingOfficers.push(officer.name);
          break; // Officer counted, move to next officer
        }
      }
    }
    
    availability.push({
      hour,
      officerCount: workingOfficers.length,
      officers: workingOfficers,
      available: workingOfficers.length < 2
    });
  }
  
  return availability;
}

/**
 * Validate if a new officer shift can be added
 */
export function canAddOfficerShift(
  existingOfficers: OfficerShift[],
  newOfficerName: string,
  newTimeRanges: TimeRange[],
  shiftStart: string,
  shiftEnd: string
): { valid: boolean; conflicts: string[] } {
  // Check minimum shift length (1 hour)
  for (const range of newTimeRanges) {
    const duration = timeToMinutes(range.end) - timeToMinutes(range.start);
    if (duration < 60) { // 1 hour = 60 minutes
      return { 
        valid: false, 
        conflicts: ['Each shift block must be at least 1 hour long'] 
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
  
  // Create a temporary list with the new officer
  const tempOfficers = [
    ...existingOfficers,
    { name: newOfficerName, timeRanges: newTimeRanges }
  ];
  
  // Check hourly availability
  const availability = getHourlyAvailability(tempOfficers, shiftStart, shiftEnd);
  const conflicts: string[] = [];
  
  for (const slot of availability) {
    if (slot.officerCount > 2) {
      conflicts.push(`Too many officers at ${slot.hour} (${slot.officers.join(', ')})`);
    }
  }
  
  return { 
    valid: conflicts.length === 0, 
    conflicts 
  };
}

/**
 * Format time ranges for display
 */
export function formatTimeRanges(ranges: TimeRange[]): string {
  return ranges.map(r => `${r.start}-${r.end}`).join(', ');
}

/**
 * Get available time slots for a shift
 */
export function getAvailableTimeSlots(
  officers: OfficerShift[],
  shiftStart: string,
  shiftEnd: string
): string[] {
  const availability = getHourlyAvailability(officers, shiftStart, shiftEnd);
  const availableSlots: string[] = [];
  
  let slotStart: string | null = null;
  
  for (let i = 0; i < availability.length; i++) {
    const current = availability[i];
    const next = availability[i + 1];

    if (current.available && !slotStart) {
      slotStart = current.hour;
    }

    if (slotStart && (!current.available || !next)) {
      // End of available slot
      const endHour = !current.available 
        ? current.hour 
        : minutesToTime(timeToMinutes(current.hour) + 60);
      availableSlots.push(`${slotStart}-${endHour}`);
      slotStart = null;
    }
  }
  
  return availableSlots;
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
