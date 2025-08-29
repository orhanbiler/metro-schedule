import { NextRequest } from 'next/server';
import { validateToken, extractToken } from './auth-validation';
import { adminDb } from './firebase-admin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  role?: string;
  name?: string;
}

/**
 * Validates the authentication token from a Next.js API request
 * @param request - The NextRequest object
 * @returns The authenticated user if valid, null otherwise
 */
export async function validateApiAuth(request: NextRequest): Promise<AuthenticatedUser | null> {
  // Get token from custom header (set by middleware) or cookies
  const tokenFromHeader = request.headers.get('x-auth-token');
  const tokenFromCookie = request.cookies.get('authToken')?.value || 
                          request.cookies.get('__session')?.value;
  const tokenFromAuthHeader = request.headers.get('authorization');
  
  const token = extractToken(tokenFromHeader || tokenFromCookie, tokenFromAuthHeader || undefined);
  
  if (!token) {
    return null;
  }
  
  const decodedToken = await validateToken(token);
  
  if (!decodedToken) {
    return null;
  }
  
  // Optionally fetch additional user data from Firestore
  try {
    const userDoc = await adminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      role: userData?.role || 'user',
      name: userData?.name,
    };
  } catch {
    // If we can't fetch user data, still return basic info from token
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
    };
  }
}

/**
 * Helper function to require authentication in API routes
 * Returns the authenticated user or throws an error
 */
export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
  const user = await validateApiAuth(request);
  
  if (!user) {
    throw new Error('Unauthorized');
  }
  
  return user;
}

/**
 * Helper function to require admin role in API routes
 */
export async function requireAdmin(request: NextRequest): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);
  
  if (user.role !== 'admin') {
    throw new Error('Forbidden - Admin access required');
  }
  
  return user;
}