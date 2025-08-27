import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {

    const { email, password, name, idNumber, rank, firebaseAuthUID } = await request.json();

    console.log('Signup attempt for:', email);

    if (!email || !password || !name || !idNumber || !rank) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists in Firestore using Admin SDK
    const usersRef = adminDb.collection('users');
    const existingUser = await usersRef.where('email', '==', email).get();

    if (!existingUser.empty) {
      console.log('User already exists:', email);
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Create user document in Firestore using Admin SDK
    const userData = {
      email,
      name,
      idNumber,
      rank,
      role: 'user',
      firebaseAuthUID: firebaseAuthUID || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let docRef;
    let userId;
    
    if (firebaseAuthUID) {
      // Use Firebase Auth UID as document ID for consistency
      docRef = usersRef.doc(firebaseAuthUID);
      await docRef.set(userData);
      userId = firebaseAuthUID;
      console.log('Created Firestore user with Firebase Auth UID:', firebaseAuthUID, 'Email:', email);
    } else {
      // Fallback to auto-generated document ID
      docRef = await usersRef.add(userData);
      userId = docRef.id;
      console.log('Created Firestore-only user:', docRef.id, 'Email:', email);
    }

    // Return user data without password
    const newUser = {
      id: userId,
      email,
      name,
      idNumber,
      rank,
      role: 'user' as const,
      firebaseAuthUID,
    };

    return NextResponse.json(newUser);

  } catch (error) {
    console.error('Signup error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to create user account',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}