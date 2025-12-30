import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateApiAuth } from '@/lib/api-auth';

const SETTINGS_DOC_ID = 'app-settings';

export async function GET(request: NextRequest) {
  try {
    // Validate authentication - only admins can view settings
    const user = await validateApiAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const settingsDoc = await adminDb().collection('settings').doc(SETTINGS_DOC_ID).get();

    if (settingsDoc.exists) {
      return NextResponse.json(settingsDoc.data());
    } else {
      // Return default settings
      return NextResponse.json({ signupDisabled: false });
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication - only admins can update settings
    const user = await validateApiAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { signupDisabled } = body;

    if (typeof signupDisabled !== 'boolean') {
      return NextResponse.json({ error: 'signupDisabled must be a boolean' }, { status: 400 });
    }

    await adminDb().collection('settings').doc(SETTINGS_DOC_ID).set(
      {
        signupDisabled,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || user.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, signupDisabled });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

