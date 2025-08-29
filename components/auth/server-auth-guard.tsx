import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateToken, extractToken } from '@/lib/auth-validation';
import { adminDb } from '@/lib/firebase-admin';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default async function ServerAuthGuard({ 
  children, 
  requireAdmin = false 
}: AuthGuardProps) {
  // Get the token from headers (set by middleware)
  const headersList = await headers();
  const tokenFromHeader = headersList.get('x-auth-token');
  
  // Extract and validate the token
  const token = extractToken(tokenFromHeader || undefined);
  
  if (!token) {
    redirect('/login');
  }
  
  const decodedToken = await validateToken(token);
  
  if (!decodedToken) {
    // Invalid token, redirect to login
    redirect('/login');
  }
  
  // If admin is required, check the user's role
  if (requireAdmin) {
    try {
      const userDoc = await adminDb().collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();
      
      if (!userData || userData.role !== 'admin') {
        // User is not an admin, redirect to dashboard
        redirect('/dashboard');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      redirect('/dashboard');
    }
  }
  
  // User is authenticated (and is admin if required)
  return <>{children}</>;
}