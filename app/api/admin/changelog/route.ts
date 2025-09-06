import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import type { ChangelogEntry } from '@/lib/changelog';
import { sendChangelogNotification } from '@/lib/email';

// Collection name for changelogs in Firestore
const CHANGELOG_COLLECTION = 'changelogs';

async function getChangelogsFromFirestore(): Promise<ChangelogEntry[]> {
  try {
    const db = adminDb();
    const snapshot = await db.collection(CHANGELOG_COLLECTION)
      .orderBy('date', 'desc')
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
    
    return changelogs;
  } catch (error) {
    console.error('Error fetching changelogs from Firestore:', error);
    return [];
  }
}

async function saveChangelogToFirestore(entry: ChangelogEntry): Promise<void> {
  const db = adminDb();
  await db.collection(CHANGELOG_COLLECTION).doc(entry.id).set(entry);
}

async function updateChangelogInFirestore(id: string, entry: ChangelogEntry): Promise<void> {
  const db = adminDb();
  // Delete old document if ID changed
  if (id !== entry.id) {
    await db.collection(CHANGELOG_COLLECTION).doc(id).delete();
  }
  await db.collection(CHANGELOG_COLLECTION).doc(entry.id).set(entry);
}

async function deleteChangelogFromFirestore(id: string): Promise<void> {
  const db = adminDb();
  await db.collection(CHANGELOG_COLLECTION).doc(id).delete();
}

async function checkChangelogExists(id: string): Promise<boolean> {
  const db = adminDb();
  const doc = await db.collection(CHANGELOG_COLLECTION).doc(id).get();
  return doc.exists;
}

async function getAllUserEmails(): Promise<string[]> {
  try {
    const db = adminDb();
    const snapshot = await db.collection('users').get();
    
    const emails: string[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.email && data.email.trim()) {
        emails.push(data.email.trim());
      }
    });
    
    return emails;
  } catch (error) {
    console.error('Error fetching user emails:', error);
    return [];
  }
}

async function sendNotificationToAllUsers(entry: ChangelogEntry): Promise<void> {
  try {
    const emails = await getAllUserEmails();
    
    if (emails.length === 0) {
      console.log('No user emails found for changelog notification');
      return;
    }

    console.log(`Sending changelog notifications to ${emails.length} users`);
    
    // Send emails in parallel but with some throttling to avoid rate limits
    const emailPromises = emails.map(email => 
      sendChangelogNotification(email, {
        title: entry.title,
        changes: entry.changes,
        type: entry.type,
        date: entry.date,
      })
    );

    const results = await Promise.allSettled(emailPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    
    console.log(`Changelog notifications sent: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.warn(`Some email notifications failed to send (${failed}/${emails.length})`);
    }
  } catch (error) {
    console.error('Error sending changelog notifications:', error);
    // Don't throw error here - we don't want email failures to prevent changelog creation
  }
}

export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const changelogs = await getChangelogsFromFirestore();
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

    // Check if ID already exists
    const exists = await checkChangelogExists(entry.id);
    if (exists) {
      return NextResponse.json({ error: 'Entry ID already exists' }, { status: 400 });
    }

    // Save new entry to Firestore
    await saveChangelogToFirestore(entry);

    // Send email notifications to all users (don't await to avoid blocking the response)
    sendNotificationToAllUsers(entry).catch(error => {
      console.error('Failed to send changelog notifications:', error);
    });

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

    // Check if original entry exists
    const originalExists = await checkChangelogExists(originalId);
    if (!originalExists) {
      return NextResponse.json({ error: 'Changelog not found' }, { status: 404 });
    }

    // Check if new ID conflicts with existing one (unless it's the same entry)
    if (entry.id !== originalId) {
      const newIdExists = await checkChangelogExists(entry.id);
      if (newIdExists) {
        return NextResponse.json({ error: 'Entry ID already exists' }, { status: 400 });
      }
    }

    // Update the entry in Firestore
    await updateChangelogInFirestore(originalId, entry);

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

    // Check if entry exists
    const exists = await checkChangelogExists(id);
    if (!exists) {
      return NextResponse.json({ error: 'Changelog not found' }, { status: 404 });
    }

    // Delete from Firestore
    await deleteChangelogFromFirestore(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting changelog:', error);
    return NextResponse.json({ error: 'Failed to delete changelog' }, { status: 500 });
  }
}