import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { extractToken, validateToken } from '@/lib/auth-validation';

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(
      request.cookies.get('authToken')?.value || request.cookies.get('__session')?.value,
      request.headers.get('authorization') || undefined
    );

    const decoded = await validateToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestedId: string = body.userId || decoded.uid;

    // Users may only read their own profile. Admin access is granted
    // after reading the caller's own record.
    if (requestedId !== decoded.uid) {
      const callerDoc = await adminDb().collection('users').doc(decoded.uid).get();
      if (callerDoc.data()?.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden - Cannot sync other users data' },
          { status: 403 }
        );
      }
    }

    const userDoc = await adminDb().collection('users').doc(requestedId).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    return NextResponse.json({
      id: userDoc.id,
      email: userData?.email,
      name: userData?.name,
      role: userData?.role,
      rank: userData?.rank,
      idNumber: userData?.idNumber,
      firebaseAuthUID: userData?.firebaseAuthUID,
      updatedAt: userData?.updatedAt,
    });
  } catch (error) {
    console.error('User sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync user data' },
      { status: 500 }
    );
  }
}
