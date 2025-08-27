import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    console.log('Fetching all users for admin');

    // Get all users from Firestore using Admin SDK
    const usersRef = adminDb.collection('users');
    const querySnapshot = await usersRef.get();

    const users = querySnapshot.docs.map(doc => {
      const userData = doc.data();
      return {
        id: doc.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
        firebaseAuthUID: userData.firebaseAuthUID || null,
      };
    });

    console.log(`Found ${users.length} users in Firestore`);

    return NextResponse.json(users);

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}