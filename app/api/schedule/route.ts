import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Initialize Firebase for API routes
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().find(app => app.name === 'server') || initializeApp(firebaseConfig, 'server');
const db = getFirestore(app);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!month || !year) {
      return NextResponse.json({ error: 'Month and year are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;
    const scheduleRef = doc(db, 'schedules', scheduleId);
    const scheduleDoc = await getDoc(scheduleRef);

    if (scheduleDoc.exists()) {
      return NextResponse.json(scheduleDoc.data());
    } else {
      return NextResponse.json({ schedule: [] });
    }
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { month, year, schedule } = await request.json();

    console.log('POST /api/schedule - Request received:', { month, year, scheduleLength: schedule?.length });

    if (!month || !year || !schedule) {
      console.error('POST /api/schedule - Missing required fields:', { month, year, schedule: !!schedule });
      return NextResponse.json({ error: 'Month, year, and schedule are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;
    console.log('POST /api/schedule - Attempting to save schedule with ID:', scheduleId);
    
    const scheduleRef = doc(db, 'schedules', scheduleId);
    
    const scheduleData = {
      month,
      year,
      schedule,
      updatedAt: new Date().toISOString()
    };

    console.log('POST /api/schedule - Schedule data prepared, calling setDoc...');
    
    await setDoc(scheduleRef, scheduleData, { merge: true });

    console.log('POST /api/schedule - Schedule saved successfully');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error('POST /api/schedule - Error saving schedule:', {
      message: err.message,
      code: err.code,
      stack: err.stack,
      name: err.name
    });
    
    // Check for specific Firebase errors
    if (err.code === 'permission-denied') {
      return NextResponse.json({ 
        error: 'Permission denied. Please check Firebase security rules.',
        code: 'permission-denied'
      }, { status: 403 });
    }
    
    if (err.code === 'unauthenticated') {
      return NextResponse.json({ 
        error: 'Authentication required. Please log in.',
        code: 'unauthenticated'
      }, { status: 401 });
    }

    return NextResponse.json({ 
      error: 'Failed to save schedule', 
      details: err.message,
      code: err.code
    }, { status: 500 });
  }
}