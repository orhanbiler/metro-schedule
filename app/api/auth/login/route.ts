import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authRateLimit } from '@/lib/rate-limit';
import { sanitizeEmail, sanitizePassword } from '@/lib/sanitize';

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await authRateLimit(request);
  
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { 
        status: 429,
        headers: {
          'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
        },
      }
    );
  }
  
  try {
    const body = await request.json();
    
    // Sanitize inputs
    const email = sanitizeEmail(body.email);
    const password = sanitizePassword(body.password);

    // Processing login request

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Valid email and password are required' },
        { status: 400 }
      );
    }

    // Check Firestore for regular users using Admin SDK
    try {
      const usersRef = adminDb().collection('users');
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