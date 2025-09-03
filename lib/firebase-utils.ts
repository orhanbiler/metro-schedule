import { Firestore } from 'firebase/firestore';

// Utility to check if Firestore instance is properly initialized
export function isFirestoreInitialized(db: unknown): db is Firestore {
  if (!db || db === null) return false;
  
  // Check if it's a real Firestore instance with proper methods
  const dbObj = db as Record<string, unknown>;
  return Boolean(
    typeof db === 'object' &&
    typeof dbObj.collection === 'function' &&
    typeof dbObj.doc === 'function' &&
    dbObj._delegate
  );
}

// Safe wrapper for Firestore operations
export function withFirestoreCheck<T extends unknown[], R>(
  operation: (...args: T) => R
) {
  return (...args: T): R | null => {
    try {
      return operation(...args);
    } catch (error) {
      console.error('Firestore operation failed:', error);
      return null;
    }
  };
}

// Check if we're running with real Firebase config
export function hasValidFirebaseConfig(): boolean {
  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
  ];
  
  return requiredVars.every(varName => {
    const value = process.env[varName];
    return value && value !== `demo-${varName.toLowerCase().replace('next_public_firebase_', '').replace('_', '-')}`;
  });
}