import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateApiAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Try to validate the requesting user
    // During initial signup, the user might not be fully authenticated yet
    const requestingUser = await validateApiAuth(request);
    
    // If we have a requesting user, verify they can sync this data
    if (requestingUser) {
      // Users can only sync their own data unless they're an admin
      if (requestingUser.uid !== userId && requestingUser.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden - Cannot sync other users data' },
          { status: 403 }
        );
      }
    }
    // If no requestingUser (during initial sync), we'll allow syncing if the user exists in DB

    // Sync user data from Firestore

    // Get user document from Firestore using Admin SDK
    const userDocRef = adminDb().collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    // User data retrieved successfully

    // Return updated user data without password
    const syncedUser = {
      id: userDoc.id,
      email: userData?.email,
      name: userData?.name,
      role: userData?.role,
      rank: userData?.rank,
      idNumber: userData?.idNumber,
      firebaseAuthUID: userData?.firebaseAuthUID,
      updatedAt: userData?.updatedAt,
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