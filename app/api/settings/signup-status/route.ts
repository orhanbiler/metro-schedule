import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const SETTINGS_DOC_ID = 'app-settings';

// Public endpoint - no authentication required
// This is used by the login page to check if signup is disabled
export async function GET() {
  try {
    const settingsDoc = await adminDb().collection('settings').doc(SETTINGS_DOC_ID).get();

    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      return NextResponse.json({ signupDisabled: data?.signupDisabled ?? false });
    } else {
      // Default: signup is enabled
      return NextResponse.json({ signupDisabled: false });
    }
  } catch (error) {
    console.error('Error fetching signup status:', error);
    // Default to allowing signup if there's an error
    return NextResponse.json({ signupDisabled: false });
  }
}

