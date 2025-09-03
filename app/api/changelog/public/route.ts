import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import type { ChangelogEntry } from '@/lib/changelog';

// Collection name for changelogs in Firestore
const CHANGELOG_COLLECTION = 'changelogs';

export async function GET() {
  try {
    const db = adminDb();
    const snapshot = await db.collection(CHANGELOG_COLLECTION)
      .orderBy('date', 'desc')
      .limit(50) // Limit to last 50 entries for performance
      .get();
    
    const changelogs: ChangelogEntry[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      changelogs.push({
        id: data.id,
        date: data.date,
        title: data.title,
        type: data.type,
        changes: data.changes,
        createdBy: data.createdBy,
      });
    });
    
    return NextResponse.json(changelogs);
  } catch (error) {
    console.error('Error fetching public changelogs:', error);
    return NextResponse.json({ error: 'Failed to fetch changelogs' }, { status: 500 });
  }
}