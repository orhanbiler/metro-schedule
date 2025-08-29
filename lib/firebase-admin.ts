import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

// Initialize Firebase Admin SDK only when environment variables are available
function initializeFirebaseAdmin(): { db: Firestore; auth: Auth } | null {
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
      
      return { db: getFirestore(), auth: getAuth() };
    }
  } else {
    return { db: getFirestore(), auth: getAuth() };
  }
  
  return null;
}

// Lazy initialization - only initialize when actually needed
function getAdminDb(): Firestore {
  if (!adminDb) {
    const result = initializeFirebaseAdmin();
    if (!result) {
      throw new Error('Firebase Admin SDK not initialized. Please check your environment variables.');
    }
    adminDb = result.db;
    adminAuth = result.auth;
  }
  return adminDb;
}

function getAdminAuth(): Auth {
  if (!adminAuth) {
    const result = initializeFirebaseAdmin();
    if (!result) {
      throw new Error('Firebase Admin SDK not initialized. Please check your environment variables.');
    }
    adminDb = result.db;
    adminAuth = result.auth;
  }
  return adminAuth;
}

export { getAdminDb as adminDb, getAdminAuth as adminAuth };