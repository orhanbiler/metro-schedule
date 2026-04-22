'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  rank?: string;
  idNumber?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  firebaseUser: FirebaseUser | null;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function syncSessionCookie(token: string): Promise<void> {
  await fetch('/api/auth/set-cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'include',
  });
}

async function clearSessionCookie(): Promise<void> {
  await fetch('/api/auth/set-cookie', {
    method: 'DELETE',
    credentials: 'include',
  });
}

async function fetchUserProfile(firebaseUser: FirebaseUser): Promise<User | null> {
  const token = await firebaseUser.getIdToken();
  const response = await fetch('/api/auth/sync-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId: firebaseUser.uid }),
  });

  if (!response.ok) return null;
  return response.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!auth?.currentUser) return;
    const profile = await fetchUserProfile(auth.currentUser);
    if (profile) setUser(profile);
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    setPersistence(auth, browserLocalPersistence).catch(console.error);

    const timeout = setTimeout(() => setLoading(false), 10000);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (fbUser) => {
        clearTimeout(timeout);
        try {
          if (fbUser) {
            setFirebaseUser(fbUser);
            const token = await fbUser.getIdToken();
            await syncSessionCookie(token);

            const profile = await fetchUserProfile(fbUser);
            if (profile) {
              setUser(profile);
            } else {
              // Firestore profile is missing — don't silently downgrade the
              // user (could lose admin role). Force sign-out.
              console.error('User profile missing in Firestore for uid', fbUser.uid);
              await signOut(auth);
              await clearSessionCookie();
              setUser(null);
              setFirebaseUser(null);
            }
          } else {
            setFirebaseUser(null);
            setUser(null);
            await clearSessionCookie();
          }
        } catch (error) {
          console.error('Auth state handler error:', error);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Auth state listener error:', error);
        clearTimeout(timeout);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const logout = async () => {
    try {
      if (auth) await signOut(auth);
    } finally {
      await clearSessionCookie();
      setUser(null);
      setFirebaseUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, firebaseUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
