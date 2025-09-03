'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [rank, setRank] = useState('Officer');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

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
      if (user && !loading) {
        // User is signed in and not currently signing up, redirect to dashboard
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
  }, [router, loading]);

  const ranks = [
    'Trainee',
    'Officer', 
    'PFC.',
    'Cpl.',
    'Sgt.',
    'Lt.',
    'Capt.',
    'Asst. Chief',
    'Chief'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      if (!auth) {
        throw new Error('Authentication not available');
      }
      
      // Create user in Firebase Authentication first
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Then create user document in Firestore via API
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          name, 
          idNumber, 
          rank,
          firebaseAuthUID: firebaseUser.uid 
        }),
      });

      if (!response.ok) {
        // If Firestore creation fails, delete the Firebase Auth user
        await firebaseUser.delete();
        const errorData = await response.json();
        throw new Error(errorData.error || 'Signup failed');
      }

      const userData = await response.json();
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Set auth cookie for middleware
      const token = await firebaseUser.getIdToken();
      document.cookie = `authToken=${token}; path=/; max-age=3600; SameSite=Lax`;
      
      toast.success('Account created successfully!');
      
      // Explicitly redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signup failed');
    } finally {
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Create an account
          </CardTitle>
          <CardDescription className="text-center">
            Join the Cheverly PD Metro Schedule system
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Last Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@cheverlypd.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idNumber">ID Number</Label>
              <Input
                id="idNumber"
                type="text"
                placeholder="1234"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rank">Rank</Label>
              <Select value={rank} onValueChange={setRank} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select your rank" />
                </SelectTrigger>
                <SelectContent>
                  {ranks.map((rankOption) => (
                    <SelectItem key={rankOption} value={rankOption}>
                      {rankOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}