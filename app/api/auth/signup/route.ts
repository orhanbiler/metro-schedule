import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

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

    // Check if user already exists in Firestore
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      console.log('User already exists:', email);
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Create user document in Firestore (Firebase Auth user already created on client)
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
    if (firebaseAuthUID) {
      // Use Firebase Auth UID as document ID for consistency
      docRef = doc(db, 'users', firebaseAuthUID);
      await setDoc(docRef, userData);
      console.log('Created Firestore user with Firebase Auth UID:', firebaseAuthUID, 'Email:', email);
    } else {
      // Fallback to auto-generated document ID
      docRef = await addDoc(usersRef, userData);
      console.log('Created Firestore-only user:', docRef.id, 'Email:', email);
    }

    // Return user data without password
    const newUser = {
      id: firebaseAuthUID || docRef.id,
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
    
    return NextResponse.json(
      { error: 'Failed to create user account' },
      { status: 500 }
    );
  }
}