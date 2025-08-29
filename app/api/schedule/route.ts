import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateApiAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!month || !year) {
      return NextResponse.json({ error: 'Month and year are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;
    // Looking up schedule document
    
    const scheduleDoc = await adminDb().collection('schedules').doc(scheduleId).get();
    // Checking if schedule document exists

    if (scheduleDoc.exists) {
      const data = scheduleDoc.data();
      // Schedule document found and loaded
      return NextResponse.json(data);
    } else {
      // No schedule document found, returning empty schedule
      return NextResponse.json({ schedule: [] });
    }
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication - all authenticated users can modify schedules
    // (Officers can sign up for shifts, admins can do everything)
    const user = await validateApiAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { month, year, schedule } = await request.json();

    // Processing schedule save request

    if (!month || !year || !schedule) {
      // Missing required fields for schedule save
      return NextResponse.json({ error: 'Month, year, and schedule are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;
    // Preparing to save schedule
    
    const scheduleData = {
      month,
      year,
      schedule,
      updatedAt: new Date().toISOString()
    };

    // Saving schedule data to database
    
    await adminDb().collection('schedules').doc(scheduleId).set(scheduleData, { merge: true });

    // Schedule saved successfully
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    // Error occurred while saving schedule
    
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