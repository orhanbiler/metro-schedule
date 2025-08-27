import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test environment variables
    const config = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    console.log('Firebase Config:', config);

    // Check if all required config values are present
    const missingConfig = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingConfig.length > 0) {
      return NextResponse.json({
        status: 'error',
        message: 'Missing Firebase configuration',
        missingConfig,
        config
      });
    }

    // Try to initialize Firebase
    try {
      await import('@/lib/firebase');
      console.log('Firebase initialized successfully');
      
      return NextResponse.json({
        status: 'success',
        message: 'Firebase connection test successful',
        projectId: config.projectId,
        authDomain: config.authDomain
      });
    } catch (firebaseError) {
      console.error('Firebase initialization error:', firebaseError);
      return NextResponse.json({
        status: 'error',
        message: 'Firebase initialization failed',
        error: firebaseError instanceof Error ? firebaseError.message : 'Unknown error',
        config
      });
    }

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}