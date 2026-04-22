import { Firestore } from 'firebase/firestore';

// Utility to check if Firestore instance is properly initialized
export function isFirestoreInitialized(db: unknown): db is Firestore {
  if (!db) return false;

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
