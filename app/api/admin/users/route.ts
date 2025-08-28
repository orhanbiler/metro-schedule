import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
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
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
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