import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Keep admin user as mock for demo
const mockAdminUser = {
  id: 'admin-1',
  email: 'admin@cheverlypd.gov',
  password: 'admin123',
  name: 'Admin User',
  role: 'admin' as const,
};

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    console.log('Login attempt for:', email);

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check mock admin user first
    if (mockAdminUser.email === email && mockAdminUser.password === password) {
      console.log('Admin login successful');
      const { password: _, ...userWithoutPassword } = mockAdminUser;
      return NextResponse.json(userWithoutPassword);
    }

    // Check Firestore for regular users
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log('User not found in Firestore:', email);
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      // Verify password (in production, use bcrypt.compare)
      if (userData.password !== password) {
        console.log('Invalid password for user:', email);
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      console.log('Firestore user login successful:', email, 'Role:', userData.role);

      // Return user data without password
      const userWithoutPassword = {
        id: userDoc.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
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