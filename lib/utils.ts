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

/**
 * Pay rates for a given period. WMATA rates increased effective July 2026, so
 * the rates used for any PDF depend on the month/year of the schedule being
 * exported (not on today's date).
 */
export interface PayRateConfig {
  /** Hourly rate for ranks below Sergeant (and unknown ranks). */
  officerRate: number;
  /** Hourly rate for Sergeant and above (command staff). */
  commandRate: number;
  /** Per-hour service charge added on top of the base rate for billable PDFs. */
  serviceCharge: number;
}

// Rates in effect July 2026 and onward.
const CURRENT_PAY_RATES: PayRateConfig = {
  officerRate: 75,
  commandRate: 105,
  serviceCharge: 5,
};

// Legacy rates in effect through June 2026.
const LEGACY_PAY_RATES: PayRateConfig = {
  officerRate: 60,
  commandRate: 65,
  serviceCharge: 10,
};

/**
 * Returns the pay rate configuration that applies to a given schedule period.
 * The new (higher) WMATA rates take effect July 2026; June 2026 and earlier use
 * the legacy rates.
 *
 * @param year  Full year of the schedule (e.g. 2026).
 * @param month Zero-indexed month (0 = January, 5 = June, 6 = July).
 */
export function getPayRateConfig(year: number, month: number): PayRateConfig {
  const usesCurrentRates = year > 2026 || (year === 2026 && month >= 6);
  return usesCurrentRates ? CURRENT_PAY_RATES : LEGACY_PAY_RATES;
}

export function calculateOfficerPayRate(rank: string | null, config: PayRateConfig): number {
  if (!rank) return config.officerRate; // Default to officer rate if rank unknown

  // Normalize rank for comparison
  const normalizedRank = rank.toLowerCase().trim();

  // Command staff (Sergeant and above) bill at the command rate; everyone else
  // bills at the officer rate.
  const commandStaffRanks = [
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

  // Check if the rank qualifies for command-staff pay
  const isCommandStaff = commandStaffRanks.some(commandRank =>
    normalizedRank.includes(commandRank)
  );

  return isCommandStaff ? config.commandRate : config.officerRate;
}