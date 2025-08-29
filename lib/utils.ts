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