# Firebase Setup for Cheverly PD Metro Schedule

## Current Configuration
- Project ID: `metro-schedule-83873`
- Auth Domain: `metro-schedule-83873.firebaseapp.com`

## Setup Steps

### 1. Create/Verify Firebase Project
1. Go to https://console.firebase.google.com/
2. Look for project `metro-schedule-83873`
3. If it doesn't exist, create a new project with this name

### 2. Enable Authentication
1. In Firebase Console → Authentication
2. Click "Get Started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

### 3. Set Up Firestore Database
1. In Firebase Console → Firestore Database
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location (closest to your users)
5. Click "Done"

### 4. Configure Security Rules (Development)
In Firestore → Rules, use these rules for development:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to all users for development
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 5. Test Connection
After setup, restart your development server:
```bash
pnpm run dev
```

### 6. Verify Collections
After a successful signup, check Firestore for:
- Collection: `users`
- Documents with user data

## Alternative: Use a Different Firebase Project

If you want to create a fresh project:
1. Create new Firebase project
2. Update `.env.local` with new configuration
3. Follow setup steps above