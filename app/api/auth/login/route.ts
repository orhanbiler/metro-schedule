import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';


export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Processing login request

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check Firestore for regular users using Admin SDK
    try {
      const usersRef = adminDb.collection('users');
      const querySnapshot = await usersRef.where('email', '==', email).get();

      if (querySnapshot.empty) {
        // User not found in database
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      // Verify password (in production, use bcrypt.compare)
      if (userData.password !== password) {
        // Password verification failed
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      // User authentication successful

      // Return user data without password
      const userWithoutPassword = {
        id: userDoc.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        rank: userData.rank,
        idNumber: userData.idNumber,
        firebaseAuthUID: userData.firebaseAuthUID,
      };

      return NextResponse.json(userWithoutPassword);

    } catch (firebaseError) {
      console.error('Firebase error:', firebaseError);
      return NextResponse.json(
        { error: 'Database connection failed. Please check Firebase setup.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}