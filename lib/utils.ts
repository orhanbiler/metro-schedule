import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function abbreviateRank(rank: string): string {
  const rankAbbreviations: { [key: string]: string } = {
    'Asst. Chief': 'A/C',
    'Assistant Chief': 'A/C',
    'Chief': 'Chief',
    'Captain': 'Capt.',
    'Capt.': 'Capt.',
    'Lieutenant': 'Lt.',
    'Lt.': 'Lt.',
    'Sergeant': 'Sgt.',
    'Sgt.': 'Sgt.',
    'Corporal': 'Cpl.',
    'Cpl.': 'Cpl.',
    'PFC.': 'PFC',
    'Officer': 'Ofc.',
    'Trainee': 'Trn.'
  };
  
  return rankAbbreviations[rank] || rank;
}

export function formatOfficerName(name: string, rank?: string, idNumber?: string): string {
  if (!rank || !idNumber) {
    return name;
  }
  
  const abbreviatedRank = abbreviateRank(rank);
  return `${abbreviatedRank} ${name} #${idNumber}`;
}

export function formatOfficerNameForDisplay(officerName: string): string {
  // First try to match "Asst. Chief" specifically
  if (officerName.startsWith('Asst. Chief ')) {
    return officerName.replace('Asst. Chief', 'A/C');
  }
  
  // Try to match pattern: "Rank LastName #ID"
  // This regex looks for everything before the last word and # as the rank
  const match = officerName.match(/^(.+)\s+([A-Z]\.\s+)?(\S+)\s+#(\d+)$/);
  
  if (match) {
    const [, rank, initial, lastName, idNumber] = match;
    const abbreviatedRank = abbreviateRank(rank.trim());
    const namepart = initial ? `${initial}${lastName}` : lastName;
    return `${abbreviatedRank} ${namepart} #${idNumber}`;
  }
  
  // Fallback: try to abbreviate known ranks at the beginning
  const parts = officerName.split(' ');
  const firstPart = parts[0];
  const abbreviated = abbreviateRank(firstPart);
  if (abbreviated !== firstPart) {
    return `${abbreviated} ${parts.slice(1).join(' ')}`;
  }
  
  return officerName;
}

export function extractRankFromOfficerName(officerName: string): string | null {
  // Try to match "Asst. Chief" specifically
  if (officerName.startsWith('Asst. Chief ')) {
    return 'Asst. Chief';
  }
  
  // Try to match pattern: "Rank LastName #ID"
  const match = officerName.match(/^(.+?)\s+\S+\s+#\d+$/);
  if (match) {
    const rank = match[1].trim();
    // Check if it's a valid rank
    const validRanks = [
      'Chief', 'Asst. Chief', 'Assistant Chief', 
      'Captain', 'Capt.', 
      'Lieutenant', 'Lt.', 
      'Sergeant', 'Sgt.', 
      'Corporal', 'Cpl.', 
      'PFC.', 'PFC',
      'Officer', 'Ofc.',
      'Trainee', 'Trn.'
    ];
    
    if (validRanks.includes(rank)) {
      return rank;
    }
  }
  
  // Fallback: check if the name starts with a rank
  const parts = officerName.split(' ');
  if (parts.length > 0) {
    const firstPart = parts[0];
    const validRankStarts = [
      'Chief', 'Asst.', 'Assistant', 
      'Captain', 'Capt.', 
      'Lieutenant', 'Lt.', 
      'Sergeant', 'Sgt.', 
      'Corporal', 'Cpl.', 
      'PFC.', 'PFC',
      'Officer', 'Ofc.',
      'Trainee', 'Trn.'
    ];
    
    if (validRankStarts.includes(firstPart)) {
      // Special case for Asst. Chief
      if (firstPart === 'Asst.' && parts[1] === 'Chief') {
        return 'Asst. Chief';
      }
      return firstPart;
    }
  }
  
  return null;
}

export function calculateHoursFromTimeString(timeStr: string): number {
  if (!timeStr) return 0;

  // Handle 24-hour format like "0500-1300" or "1300-2200"
  const militaryMatch = timeStr.match(/(\d{4})-(\d{4})/);
  if (militaryMatch) {
    const [, startStr, endStr] = militaryMatch;
    const startMinutes = parseInt(startStr.slice(0, 2)) * 60 + parseInt(startStr.slice(2, 4));
    let endMinutes = parseInt(endStr.slice(0, 2)) * 60 + parseInt(endStr.slice(2, 4));
    if (endMinutes < startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
  }

  // Handle 12-hour format like "6am-2pm", "10pm-6am"
  const ampmMatch = timeStr.match(/(\d+)(am|pm)-(\d+)(am|pm)/i);
  if (ampmMatch) {
    const [, startHour, startPeriod, endHour, endPeriod] = ampmMatch;
    let start = parseInt(startHour);
    let end = parseInt(endHour);
    if (start === 12 && startPeriod.toLowerCase() === 'am') start = 0;
    else if (start !== 12 && startPeriod.toLowerCase() === 'pm') start += 12;
    if (end === 12 && endPeriod.toLowerCase() === 'am') end = 0;
    else if (end !== 12 && endPeriod.toLowerCase() === 'pm') end += 12;
    let hours = end - start;
    if (hours < 0) hours += 24;
    return hours;
  }

  // Handle format like "05:00-13:00"
  const colonMatch = timeStr.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
  if (colonMatch) {
    const [, startHour, startMin, endHour, endMin] = colonMatch;
    const startMinutes = parseInt(startHour) * 60 + parseInt(startMin);
    let endMinutes = parseInt(endHour) * 60 + parseInt(endMin);
    if (endMinutes < startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
  }

  return 0;
}

export function calculateOfficerPayRate(rank: string | null): number {
  if (!rank) return 60; // Default to lower rate if rank unknown
  
  // Normalize rank for comparison
  const normalizedRank = rank.toLowerCase().trim();
  
  // Ranks that get $65/hour (Sergeant and above)
  const higherPayRanks = [
    'chief', 
    'asst. chief', 
    'assistant chief',
    'captain', 
    'capt.',
    'lieutenant', 
    'lt.',
    'sergeant',
    'sgt.'
  ];
  
  // Check if the rank qualifies for higher pay
  const getsHigherPay = higherPayRanks.some(higherRank => 
    normalizedRank.includes(higherRank)
  );
  
  return getsHigherPay ? 65 : 60;
}