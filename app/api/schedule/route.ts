import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!month || !year) {
      return NextResponse.json({ error: 'Month and year are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;
    console.log('GET schedule - Looking for document:', scheduleId);
    
    const scheduleDoc = await adminDb.collection('schedules').doc(scheduleId).get();
    console.log('GET schedule - Document exists:', scheduleDoc.exists);

    if (scheduleDoc.exists) {
      const data = scheduleDoc.data();
      console.log('GET schedule - Document data keys:', Object.keys(data || {}));
      console.log('GET schedule - Schedule array length:', data?.schedule?.length || 0);
      return NextResponse.json(data);
    } else {
      console.log('GET schedule - No document found, returning empty schedule');
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
    
    const scheduleData = {
      month,
      year,
      schedule,
      updatedAt: new Date().toISOString()
    };

    console.log('POST /api/schedule - Schedule data prepared, calling set...');
    
    await adminDb.collection('schedules').doc(scheduleId).set(scheduleData, { merge: true });

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