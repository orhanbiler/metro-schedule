export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  type: 'feature' | 'fix' | 'improvement' | 'security' | 'update' | 'maintenance' | 'performance' | 'ui' | 'breaking';
  changes: string[];
  createdBy: {
    name: string;
    rank?: string;
    idNumber?: string;
  };
}

// This will be populated from the API/database
export let CHANGELOG: ChangelogEntry[] = [];

// Get the latest entry ID
export const getCurrentEntryId = () => CHANGELOG.length > 0 ? CHANGELOG[0].id : '';

// Helper to get changelog entries after a specific ID
export function getChangesSinceEntry(lastSeenEntryId: string | null): ChangelogEntry[] {
  if (!lastSeenEntryId) {
    // If no entry seen, show last 3 entries
    return CHANGELOG.slice(0, 3);
  }
  
  const lastSeenIndex = CHANGELOG.findIndex(entry => entry.id === lastSeenEntryId);
  if (lastSeenIndex === -1) {
    // Entry not found, show last 3 entries
    return CHANGELOG.slice(0, 3);
  }
  
  // Return all entries newer than the last seen entry
  return CHANGELOG.slice(0, lastSeenIndex);
}

// Helper to format creator name
export function formatCreatorName(createdBy?: { name: string; rank?: string; idNumber?: string }): string {
  if (!createdBy) return 'Unknown';
  
  const parts = [];
  if (createdBy.rank) parts.push(createdBy.rank);
  parts.push(createdBy.name);
  if (createdBy.idNumber) parts.push(`#${createdBy.idNumber}`);
  
  return parts.join(' ');
}

// Fetch changelogs from the API
export async function fetchChangelogs(): Promise<ChangelogEntry[]> {
  try {
    const response = await fetch('/api/changelog/public');
    if (!response.ok) {
      console.error('Failed to fetch changelogs:', response.statusText);
      return [];
    }
    const data = await response.json();
    CHANGELOG = data;
    return data;
  } catch (error) {
    console.error('Error fetching changelogs:', error);
    return [];
  }
}

// Initialize changelogs on client side
if (typeof window !== 'undefined') {
  fetchChangelogs().catch(console.error);
}