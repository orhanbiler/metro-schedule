import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore | null = null;

// Initialize Firebase Admin SDK only when environment variables are available
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    // Only initialize if all required environment variables are present
    if (projectId && clientEmail && privateKey) {
      const serviceAccount: ServiceAccount = {
        projectId,
        clientEmail,
        privateKey,
      };
      
      initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
      
      return getFirestore();
    }
  } else {
    return getFirestore();
  }
  
  return null;
}

// Lazy initialization - only initialize when actually needed
function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = initializeFirebaseAdmin();
    if (!adminDb) {
      throw new Error('Firebase Admin SDK not initialized. Please check your environment variables.');
    }
  }
  return adminDb;
}

export { getAdminDb as adminDb };