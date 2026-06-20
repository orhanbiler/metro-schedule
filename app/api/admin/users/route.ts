import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { normalizeAssignment, isValidAssignment } from '@/lib/assignments';

export async function GET(request: NextRequest) {
  try {
    // Validate authentication - only admins can view all users
    await requireAdmin(request);
    // Fetching all users from database

    // Get all users from Firestore using Admin SDK
    const usersRef = adminDb().collection('users');
    const querySnapshot = await usersRef.get();

    const users = querySnapshot.docs.map(doc => {
      const userData = doc.data();
      return {
        id: doc.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        rank: userData.rank || null,
        idNumber: userData.idNumber || null,
        assignment: normalizeAssignment(userData.assignment),
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
        lastSeenAt: userData.lastSeenAt || null,
        firebaseAuthUID: userData.firebaseAuthUID || null,
      };
    });

    // Successfully retrieved user data

    return NextResponse.json(users);

  } catch {
    // Error occurred while fetching users
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Only admins can change a user's assignment
    await requireAdmin(request);

    const { userId, assignment } = await request.json();

    if (!userId || !isValidAssignment(assignment)) {
      return NextResponse.json(
        { error: 'A valid userId and assignment are required' },
        { status: 400 }
      );
    }

    const userRef = adminDb().collection('users').doc(userId);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await userRef.update({ assignment, updatedAt: new Date().toISOString() });

    return NextResponse.json({ success: true, assignment });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update user assignment' },
      { status: 500 }
    );
  }
}