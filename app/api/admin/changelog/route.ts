import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ChangelogEntry } from '@/lib/changelog';

const CHANGELOG_FILE_PATH = join(process.cwd(), 'lib', 'changelog.ts');

function readChangelogFile(): ChangelogEntry[] {
  try {
    const content = readFileSync(CHANGELOG_FILE_PATH, 'utf-8');
    // Extract the CHANGELOG array from the file content
    const match = content.match(/export const CHANGELOG: ChangelogEntry\[\] = (\[[\s\S]*?\]);/);
    if (match) {
      // Use Function constructor to safely evaluate the array
      return new Function('return ' + match[1])();
    }
    return [];
  } catch (error) {
    console.error('Error reading changelog file:', error);
    return [];
  }
}

function writeChangelogFile(changelogs: ChangelogEntry[]) {
  try {
    const content = `export interface ChangelogEntry {
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

export const CHANGELOG: ChangelogEntry[] = ${JSON.stringify(changelogs, null, 2)};

// Get the latest entry ID
export const CURRENT_ENTRY_ID = CHANGELOG.length > 0 ? CHANGELOG[0].id : '';

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
  if (createdBy.idNumber) parts.push(\`#\${createdBy.idNumber}\`);
  
  return parts.join(' ');
}`;

    writeFileSync(CHANGELOG_FILE_PATH, content, 'utf-8');
  } catch (error) {
    console.error('Error writing changelog file:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const changelogs = readChangelogFile();
    return NextResponse.json(changelogs);
  } catch (error) {
    console.error('Error fetching changelogs:', error);
    return NextResponse.json({ error: 'Failed to fetch changelogs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { entry }: { entry: ChangelogEntry } = await request.json();

    if (!entry.id || !entry.date || !entry.title || !entry.changes || entry.changes.length === 0 || !entry.createdBy?.name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const changelogs = readChangelogFile();
    
    // Check if ID already exists
    if (changelogs.some(changelog => changelog.id === entry.id)) {
      return NextResponse.json({ error: 'Entry ID already exists' }, { status: 400 });
    }

    // Add new entry at the beginning (latest first)
    const updatedChangelogs = [entry, ...changelogs];
    writeChangelogFile(updatedChangelogs);

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating changelog:', error);
    return NextResponse.json({ error: 'Failed to create changelog' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { entry, originalId }: { entry: ChangelogEntry; originalId: string } = await request.json();

    if (!entry.id || !entry.date || !entry.title || !entry.changes || entry.changes.length === 0 || !entry.createdBy?.name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const changelogs = readChangelogFile();
    const index = changelogs.findIndex(changelog => changelog.id === originalId);
    
    if (index === -1) {
      return NextResponse.json({ error: 'Changelog not found' }, { status: 404 });
    }

    // Check if new ID conflicts with existing one (unless it's the same entry)
    if (entry.id !== originalId && changelogs.some(changelog => changelog.id === entry.id)) {
      return NextResponse.json({ error: 'Entry ID already exists' }, { status: 400 });
    }

    // Update the entry
    changelogs[index] = entry;
    writeChangelogFile(changelogs);

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error updating changelog:', error);
    return NextResponse.json({ error: 'Failed to update changelog' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id }: { id: string } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const changelogs = readChangelogFile();
    const updatedChangelogs = changelogs.filter(changelog => changelog.id !== id);
    
    if (updatedChangelogs.length === changelogs.length) {
      return NextResponse.json({ error: 'Changelog not found' }, { status: 404 });
    }

    writeChangelogFile(updatedChangelogs);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting changelog:', error);
    return NextResponse.json({ error: 'Failed to delete changelog' }, { status: 500 });
  }
}