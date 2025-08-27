import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching all users for admin');

    // Get all users from Firestore
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);

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

    // Add mock admin user
    const allUsers = [
      {
        id: 'admin-1',
        email: 'admin@cheverlypd.gov',
        name: 'Admin User',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firebaseAuthUID: null,
        isMockUser: true,
      },
      ...users
    ];

    return NextResponse.json(allUsers);

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}