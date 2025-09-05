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