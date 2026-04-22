import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { extractToken, validateToken } from '@/lib/auth-validation';

const SETTINGS_DOC_ID = 'app-settings';

export async function POST(request: NextRequest) {
  try {
    const settingsDoc = await adminDb().collection('settings').doc(SETTINGS_DOC_ID).get();
    if (settingsDoc.exists && settingsDoc.data()?.signupDisabled) {
      return NextResponse.json(
        { error: 'Sign-up is currently disabled. Please contact an administrator.' },
        { status: 403 }
      );
    }

    const token = extractToken(
      request.cookies.get('authToken')?.value || request.cookies.get('__session')?.value,
      request.headers.get('authorization') || undefined
    );

    const decoded = await validateToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or missing authentication token' },
        { status: 401 }
      );
    }

    const { name, idNumber, rank } = await request.json();
    if (!name || !idNumber || !rank) {
      return NextResponse.json(
        { error: 'Name, ID number, and rank are required' },
        { status: 400 }
      );
    }

    const email = decoded.email;
    if (!email) {
      return NextResponse.json(
        { error: 'Authenticated user has no email on record' },
        { status: 400 }
      );
    }

    const usersRef = adminDb().collection('users');

    // Prevent duplicate profile for the same auth account
    const existing = await usersRef.doc(decoded.uid).get();
    if (existing.exists) {
      return NextResponse.json(
        { error: 'User profile already exists' },
        { status: 409 }
      );
    }

    // Guard against email reuse under a different UID
    const emailMatch = await usersRef.where('email', '==', email).get();
    if (!emailMatch.empty) {
      // Remove the Firebase Auth account to keep state consistent
      await adminAuth().deleteUser(decoded.uid).catch(() => undefined);
      return NextResponse.json(
        { error: 'A profile with this email already exists' },
        { status: 409 }
      );
    }

    const userData = {
      email,
      name,
      idNumber,
      rank,
      role: 'user' as const,
      firebaseAuthUID: decoded.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await usersRef.doc(decoded.uid).set(userData);

    return NextResponse.json({ id: decoded.uid, ...userData });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create user account',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
