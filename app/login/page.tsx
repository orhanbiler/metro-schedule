'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [signupDisabled, setSignupDisabled] = useState(true); // Default to disabled until we know
  const [signupStatusLoaded, setSignupStatusLoaded] = useState(false);
  const router = useRouter();

  // Check if signup is disabled
  useEffect(() => {
    const checkSignupStatus = async () => {
      try {
        const response = await fetch('/api/settings/signup-status');
        if (response.ok) {
          const data = await response.json();
          setSignupDisabled(data.signupDisabled ?? false);
        }
      } catch (error) {
        console.error('Error checking signup status:', error);
        // On error, default to showing signup link
        setSignupDisabled(false);
      } finally {
        setSignupStatusLoaded(true);
      }
    };
    checkSignupStatus();
  }, []);

  useEffect(() => {
    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setCheckingAuth(false);
    }, 5000); // 5 second timeout

    // Check if user is already authenticated only if auth is available
    if (!auth) {
      setCheckingAuth(false);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      // Only redirect if not currently logging in and not already redirecting
      if (user && !loading && !isRedirecting) {
        // User is signed in and not currently logging in, redirect to dashboard
        setIsRedirecting(true);
        router.push('/dashboard');
      }
      // Always stop checking auth after we get a response
      setCheckingAuth(false);
    }, (error) => {
      console.error('Auth state check error:', error);
      clearTimeout(timeout);
      setCheckingAuth(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, loading, isRedirecting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIsRedirecting(true); // Prevent auth listener from interfering

    try {
      if (!auth) {
        throw new Error('Authentication not available');
      }
      
      // Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Get user data from Firestore using sync API
      const response = await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: firebaseUser.uid }),
      });

      if (!response.ok) {
        throw new Error('Failed to load user data');
      }

      const userData = await response.json();
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Set auth cookie for middleware
      const token = await firebaseUser.getIdToken();
      document.cookie = `authToken=${token}; path=/; max-age=3600; SameSite=Lax`;
      
      toast.success('Login successful!');
      
      // Use window.location for more reliable redirect
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 100);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password') {
        toast.error('Invalid email or password');
      } else if (firebaseError.code === 'auth/invalid-email') {
        toast.error('Invalid email address');
      } else if (firebaseError.code === 'auth/user-disabled') {
        toast.error('Account has been disabled');
      } else {
        toast.error(err instanceof Error ? err.message : 'Login failed');
      }
      // Reset flags on error
      setIsRedirecting(false);
      setLoading(false);
    }
  };

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 text-foreground">
      {/* Mobile background - visible only on small screens, theme-aware */}
      <div className="fixed inset-0 lg:hidden -z-10 bg-background">
        {/* Gradient overlay - adapts to theme */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 dark:from-primary/10 dark:via-transparent dark:to-emerald-500/10" />
        {/* Geometric accent shapes */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 dark:bg-primary/20 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-3xl transform -translate-x-1/3 translate-y-1/3" />
        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }} />
      </div>

      {/* Desktop left panel - hidden on mobile */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-primary to-slate-900 p-10 text-white">
        <div className="absolute inset-0 opacity-20">
          <Image
            src="/logo-cool.png"
            alt="Cheverly Police Department"
            fill
            sizes="50vw"
            className="object-contain object-center"
            priority
          />
        </div>
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm uppercase tracking-wide">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            Cheverly PD Metro Detail
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight">Protecting The Line Starts With A Solid Schedule</h1>
            <p className="mt-3 max-w-md text-white/80">
              Review coverage, lock in overtime, and keep your team coordinated with real-time updates from HQ.
            </p>
          </div>
          <ul className="space-y-3 text-white/80">
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
              Secure access backed by Firebase authentication
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
              Live schedule sync so every shift stays covered
            </li>
          </ul>
        </div>
        <div className="relative z-10 text-sm text-white/70">
          Need help? Email <a href="mailto:obiler@cheverlypolice.org" className="underline">obiler@cheverlypolice.org</a>
        </div>
      </div>

      {/* Login form panel */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-10">
        {/* Mobile header - visible only on small screens */}
        <div className="lg:hidden mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 px-4 py-2 text-sm uppercase tracking-wide text-primary dark:text-primary-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">Cheverly PD</span>
          </div>
        </div>

        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Cheverly PD Metro Portal</CardTitle>
            <CardDescription>
              Sign in with your department-issued credentials to manage metro coverage.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <CardContent className="space-y-4">
              <div className="space-y-2 text-left">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="officer@cheverlypd.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2 text-left">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
                    onKeyDown={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLockOn(false)}
                    autoComplete="current-password"
                    required
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-2 flex items-center rounded-md px-2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {capsLockOn && (
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    Caps Lock is on
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
              <div className="flex flex-col gap-2 text-sm text-center text-muted-foreground">
                <button
                  type="button"
                  onClick={() => { window.location.href = 'mailto:obiler@cheverlypolice.org'; }}
                  className="text-primary hover:underline"
                >
                  Forgot password or need access?
                </button>
                {signupStatusLoaded && !signupDisabled && (
                  <div>
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" className="text-primary hover:underline">
                      Request one
                    </Link>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Need help? Email <a href="mailto:obiler@cheverlypolice.org" className="text-primary hover:underline">obiler@cheverlypolice.org</a>
                </p>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
