#!/usr/bin/env node

/**
 * Migration script to move changelog entries from the static file to Firestore
 * Run this script once to migrate existing data
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { ChangelogEntry } from '../lib/changelog';

// Initialize Firebase Admin SDK
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing required Firebase Admin environment variables');
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId,
    clientEmail,
    privateKey,
  }),
  projectId,
});

const db = getFirestore();
const CHANGELOG_COLLECTION = 'changelogs';

async function migrateChangelogs() {
  try {
    // Read the changelog file
    const changelogPath = join(process.cwd(), 'lib', 'changelog.ts');
    const content = readFileSync(changelogPath, 'utf-8');
    
    // Extract the CHANGELOG array from the file content
    const match = content.match(/export const CHANGELOG: ChangelogEntry\[\] = (\[[\s\S]*?\]);/);
    if (!match) {
      console.log('No changelog entries found in the file or already empty');
      return;
    }
    
    // Parse the changelog entries
    const changelogs: ChangelogEntry[] = eval(match[1]);
    
    if (changelogs.length === 0) {
      console.log('No changelog entries to migrate');
      return;
    }
    
    console.log(`Found ${changelogs.length} changelog entries to migrate`);
    
    // Check if changelogs already exist in Firestore
    const existingDocs = await db.collection(CHANGELOG_COLLECTION).limit(1).get();
    if (!existingDocs.empty) {
      console.log('Changelogs already exist in Firestore. Skipping migration to avoid duplicates.');
      console.log('If you want to force migration, please clear the Firestore collection first.');
      return;
    }
    
    // Migrate each changelog entry to Firestore
    const batch = db.batch();
    for (const entry of changelogs) {
      const docRef = db.collection(CHANGELOG_COLLECTION).doc(entry.id);
      batch.set(docRef, entry);
      console.log(`Migrating changelog: ${entry.id} - ${entry.title}`);
    }
    
    // Commit the batch
    await batch.commit();
    console.log(`Successfully migrated ${changelogs.length} changelog entries to Firestore`);
    
    console.log('\nMigration complete! The changelog entries are now stored in Firestore.');
    console.log('The static file will no longer be used for storing data.');
    
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

// Run the migration
migrateChangelogs().then(() => {
  console.log('Migration script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});