import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let analytics: Promise<Analytics | null> | null = null;

const hasRequiredConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

if (hasRequiredConfig) {
  try {
    app = getApps().length === 0
      ? initializeApp(firebaseConfig as Record<string, string>)
      : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);

    if (typeof window !== 'undefined' && app) {
      analytics = isSupported().then(yes => yes && app ? getAnalytics(app) : null);
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    app = null;
    auth = null;
    db = null;
  }
} else if (typeof window !== 'undefined') {
  console.error(
    'Firebase configuration missing. Set NEXT_PUBLIC_FIREBASE_* environment variables.'
  );
}

export { app as default, auth, db, analytics };
