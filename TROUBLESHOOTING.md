# Troubleshooting Guide

## Admin Role Not Reflecting After Firebase Update

If you've changed your role to "admin" in Firebase Firestore but it's not reflecting in the application, here are the solutions:

### Solution 1: Force Sync (Recommended)
1. Go to your **Profile** page (`/dashboard/profile`)
2. Click the **"Sync Account"** button
3. This will immediately fetch your latest data from Firebase
4. The page will refresh and your admin role should be active

### Solution 2: Clear Cache and Re-login
1. Click **Logout** in the navigation bar
2. Clear your browser's local storage:
   - Open browser DevTools (F12)
   - Go to Application/Storage tab
   - Find "Local Storage" → your domain
   - Right-click and "Clear"
3. Login again with your credentials
4. Your updated role will be fetched from Firebase

### Solution 3: Wait for Auto-Sync
- The application automatically syncs user data every 30 seconds
- Simply wait on any dashboard page and your role will update automatically
- You'll see a console log: "Role changed from user to admin"

## Verifying Your Role in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `metro-schedule-83873`
3. Navigate to **Firestore Database**
4. Find the `users` collection
5. Locate your user document (by email)
6. Ensure the `role` field is set to `"admin"` (not `"user"`)

## Common Issues

### Issue: Role field is missing
- **Solution**: Add a field called `role` with value `"admin"` to your user document

### Issue: Wrong document ID
- If you signed up with Firebase Auth, your document ID should be your Firebase Auth UID
- Check that you're editing the correct user document

### Issue: Cached data
- Browser is showing old cached data
- **Solution**: Force refresh with Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

## Developer Notes

### How Role Sync Works:
1. On login, user data is stored in localStorage
2. Dashboard layout runs a sync every 30 seconds
3. Sync checks Firestore for role changes
4. If role changed, updates localStorage and state
5. Admin menu items appear/disappear based on role

### Manual Sync Endpoint:
```
POST /api/auth/sync-user
Body: { "userId": "your-user-doc-id" }
```

This endpoint fetches the latest user data from Firestore and returns it.