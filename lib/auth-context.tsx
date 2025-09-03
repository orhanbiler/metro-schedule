'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, User as FirebaseUser } from 'firebase/auth';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if auth is available
    if (!auth) {
      setLoading(false);
      return;
    }
    
    // Set persistence to LOCAL (survives browser restarts)
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.warn('Auth check timeout - forcing loading to false');
      setLoading(false);
    }, 10000); // 10 second timeout for auth context

    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      if (firebaseUser) {
        setFirebaseUser(firebaseUser);
        
        // Try to get user data from localStorage first for immediate UI update
        const cachedUser = localStorage.getItem('user');
        if (cachedUser) {
          const userData = JSON.parse(cachedUser);
          // Verify the cached user matches the Firebase user
          // Check both id and firebaseAuthUID for compatibility
          if (userData.id === firebaseUser.uid || userData.firebaseAuthUID === firebaseUser.uid) {
            setUser(userData);
          }
        }

        // Get fresh token immediately
        const token = await firebaseUser.getIdToken();
        
        // Set auth cookies immediately to ensure they're available for any API calls
        document.cookie = `authToken=${token}; path=/; max-age=3600; SameSite=Lax`;
        document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Lax`;

        // Then sync with Firestore to get latest data
        try {
          const response = await fetch('/api/auth/sync-user', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}` // Include token in header
            },
            body: JSON.stringify({ userId: firebaseUser.uid }),
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
          } else if (response.status === 404) {
            console.error('Sync-user endpoint not found. Using cached user data.');
            // Try to use cached user data if available
            const cachedUserStr = localStorage.getItem('user');
            if (cachedUserStr) {
              try {
                const cachedUser = JSON.parse(cachedUserStr);
                if (cachedUser.id === firebaseUser.uid) {
                  setUser(cachedUser);
                  return; // Exit early if we have valid cached data
                }
              } catch (e) {
                console.error('Failed to parse cached user data:', e);
              }
            }
            // Fallback to basic user info from Firebase
            const basicUser = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
              role: 'user' as const,
            };
            setUser(basicUser);
            localStorage.setItem('user', JSON.stringify(basicUser));
          }
        } catch (error) {
          console.error('Failed to sync user data:', error);
          // Try to use cached user data if available
          const cachedUserStr = localStorage.getItem('user');
          if (cachedUserStr) {
            try {
              const cachedUser = JSON.parse(cachedUserStr);
              if (cachedUser.id === firebaseUser.uid) {
                setUser(cachedUser);
                return; // Exit early if we have valid cached data
              }
            } catch (e) {
              console.error('Failed to parse cached user data:', e);
            }
          }
          // Fallback to basic user info from Firebase
          const basicUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
            role: 'user' as const,
          };
          setUser(basicUser);
          localStorage.setItem('user', JSON.stringify(basicUser));
        }
      } else {
        // User is logged out
        setFirebaseUser(null);
        setUser(null);
        localStorage.removeItem('user');
        // Clear auth cookie
        document.cookie = 'authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
      
      setLoading(false);
    }, (error) => {
      console.error('Auth state listener error:', error);
      clearTimeout(timeout);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const logout = async () => {
    try {
      // Sign out from Firebase if available
      if (auth) {
        await signOut(auth);
      }
      // Clear local storage
      localStorage.removeItem('user');
      // Clear auth cookie
      document.cookie = 'authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      // The onAuthStateChanged listener will handle the rest
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, firebaseUser, logout }}>
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