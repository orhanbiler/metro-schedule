import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateApiAuth } from '@/lib/api-auth';
import { normalizeAssignment } from '@/lib/assignments';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Require a valid Firebase ID token. The token is verified server-side,
    // so the caller's identity cannot be forged.
    const requestingUser = await validateApiAuth(request);
    if (!requestingUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Users can only sync their own data unless they're an admin.
    if (requestingUser.uid !== userId && requestingUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Cannot sync other users data' },
        { status: 403 }
      );
    }

    // Sync user data from Firestore

    // Get user document from Firestore using Admin SDK
    const userDocRef = adminDb().collection('users').doc(userId);
    let userDoc = await userDocRef.get();

    // Race: during signup the Auth user is created before the Firestore doc.
    // If the requesting user is syncing themselves, poll briefly for the doc.
    if (!userDoc.exists && requestingUser && requestingUser.uid === userId) {
      for (let i = 0; i < 6 && !userDoc.exists; i++) {
        await new Promise((r) => setTimeout(r, 500));
        userDoc = await userDocRef.get();
      }
    }

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    // User data retrieved successfully

    // Bump lastSeenAt when the syncing user is the doc owner. Throttled to
    // one write per ~5 minutes so navigation doesn't burn Firestore quota.
    let lastSeenAt: string | undefined = userData?.lastSeenAt;
    if (requestingUser && requestingUser.uid === userId) {
      const now = Date.now();
      const previous = lastSeenAt ? Date.parse(lastSeenAt) : 0;
      if (!previous || now - previous > 5 * 60 * 1000) {
        lastSeenAt = new Date(now).toISOString();
        await userDocRef.update({ lastSeenAt });
      }
    }

    // Return updated user data without password
    const syncedUser = {
      id: userDoc.id,
      email: userData?.email,
      name: userData?.name,
      role: userData?.role,
      rank: userData?.rank,
      idNumber: userData?.idNumber,
      assignment: normalizeAssignment(userData?.assignment),
      firebaseAuthUID: userData?.firebaseAuthUID,
      updatedAt: userData?.updatedAt,
      lastSeenAt,
    };

    return NextResponse.json(syncedUser);

  } catch (error) {
    console.error('User sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync user data' },
      { status: 500 }
    );
  }
}