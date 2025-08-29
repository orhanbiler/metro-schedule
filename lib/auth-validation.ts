import { adminAuth } from './firebase-admin';
import { DecodedIdToken } from 'firebase-admin/auth';

/**
 * Validates a Firebase ID token and returns the decoded token if valid
 * @param token - The Firebase ID token to validate
 * @returns The decoded token if valid, null otherwise
 */
export async function validateToken(token: string | undefined): Promise<DecodedIdToken | null> {
  if (!token) {
    return null;
  }

  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await adminAuth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
}

/**
 * Extracts the token from various sources (cookie, authorization header)
 * @param cookieValue - The cookie string value
 * @param authHeader - The authorization header value
 * @returns The extracted token or undefined
 */
export function extractToken(
  cookieValue?: string,
  authHeader?: string
): string | undefined {
  // Try to get token from cookie first
  if (cookieValue) {
    return cookieValue;
  }

  // Try to get token from Authorization header (Bearer token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return undefined;
}