# Security Fix: Authentication & Authorization

## Summary
Fixed critical authorization bypass vulnerability where protected routes were accessible without authentication by implementing proper server-side token validation.

## Changes Made

### 1. Enhanced Firebase Admin Configuration (`lib/firebase-admin.ts`)
- Added Firebase Auth admin functionality for server-side token validation
- Exported `adminAuth` for verifying ID tokens

### 2. Created Authentication Validation Utilities
- **`lib/auth-validation.ts`**: Core token validation functions using Firebase Admin SDK
- **`lib/api-auth.ts`**: API route authentication helpers with role-based access control
- **`components/auth/server-auth-guard.tsx`**: Server component for protecting pages

### 3. Updated Middleware (`middleware.ts`)
- Added token existence checks for protected routes
- Blocks access to protected API routes without tokens
- Passes tokens via headers for server-side validation
- Redirects unauthenticated users to login page

### 4. Secured API Routes
- **`app/api/schedule/route.ts`**: Added authentication check for all operations (authenticated users can modify schedules to sign up for shifts)
- **`app/api/admin/users/route.ts`**: Admin-only access
- **`app/api/auth/sync-user/route.ts`**: Users can only sync their own data (unless admin)

## Security Improvements

### Before
- Authentication was purely client-side
- Protected routes accessible by disabling JavaScript
- API routes had no authentication checks
- Complete authorization bypass possible

### After
- Server-side token validation using Firebase Admin SDK
- Middleware blocks unauthenticated access to protected routes
- API routes validate authentication and authorization
- Role-based access control (admin vs regular users)
- Users can only access their own data (with admin override)

## Implementation Details

### Token Flow
1. User logs in → Firebase ID token stored in cookie
2. Middleware checks token existence for protected routes
3. Token passed to server components/API routes via headers
4. Server-side validation using Firebase Admin SDK
5. Access granted/denied based on validation result

### Defense in Depth
- **Layer 1**: Middleware checks (fast, prevents obvious unauthorized access)
- **Layer 2**: Server-side validation (secure, verifies token authenticity)
- **Layer 3**: Role-based checks (authorization for sensitive operations)

## Testing Recommendations

1. **Test unauthorized access**: Try accessing `/dashboard` without logging in
2. **Test token tampering**: Modify the authToken cookie and verify rejection
3. **Test role escalation**: Regular user trying to access admin endpoints
4. **Test API protection**: Direct API calls without authentication

## Environment Variables Required

Ensure these Firebase Admin credentials are set:
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

## Notes

- Firebase Admin SDK validates tokens server-side, preventing client-side bypasses
- Middleware provides initial protection but real security comes from server-side validation
- Each API route must explicitly check authentication using the provided utilities
- Consider implementing rate limiting for additional protection against brute force attacks