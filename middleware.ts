import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicPath = path === '/login' || path === '/signup' || path === '/';
  const isProtectedPath = path.startsWith('/dashboard');
  const isApiPath = path.startsWith('/api');
  
  // Skip middleware for public API routes
  const publicApiPaths = ['/api/auth/login', '/api/auth/signup', '/api/auth/sync-user'];
  if (publicApiPaths.some(apiPath => path.startsWith(apiPath))) {
    return NextResponse.next();
  }
  
  // Get the auth token from cookies
  const token = request.cookies.get('__session')?.value || 
                 request.cookies.get('authToken')?.value;

  // For protected API routes, add token to headers for validation in the route handler
  if (isApiPath && !publicApiPaths.includes(path)) {
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - No token provided' },
        { status: 401 }
      );
    }
    
    // Add token to headers so API routes can validate it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-token', token);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Redirect to dashboard if trying to access login/signup while authenticated
  if (isPublicPath && token && (path === '/login' || path === '/signup')) {
    // Note: We're not validating the token here for performance reasons
    // Invalid tokens will be caught when accessing protected routes
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }

  // Allow access to public paths
  if (isPublicPath) {
    return NextResponse.next();
  }

  // For protected paths, check if token exists
  if (isProtectedPath && !token) {
    // No token, redirect to login
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // Token exists for protected path
  // Server-side validation will happen in Server Components and API routes
  // This is because Next.js middleware has limitations with async operations
  // and Firebase Admin SDK requires async token verification
  
  // Add token to headers for server components to validate
  if (isProtectedPath && token) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-token', token);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|logo.png|media).*)',
    '/api/:path*',
  ],
};