/**
 * Utility functions for managing schedule with hourly officer limits
 */

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

/**
 * Check if two time ranges overlap
 */
function rangesOverlap(range1: TimeRange, range2: TimeRange): boolean {
  const start1 = timeToMinutes(range1.start);
  const end1 = timeToMinutes(range1.end);
  const start2 = timeToMinutes(range2.start);
  const end2 = timeToMinutes(range2.end);
  
  return start1 < end2 && end1 > start2;
}

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
  // Check minimum shift length (2 hours)
  for (const range of newTimeRanges) {
    const duration = timeToMinutes(range.end) - timeToMinutes(range.start);
    if (duration < 120) { // 2 hours = 120 minutes
      return { 
        valid: false, 
        conflicts: ['Each shift block must be at least 2 hours long'] 
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
