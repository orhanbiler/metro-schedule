import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateApiAuth } from '@/lib/api-auth';
import { validateScheduleSave } from '@/lib/schedule-validation';
import { buildScheduleAuditEntries } from '@/lib/schedule-audit';

export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'User authentication failed. Please log in again.' }, { status: 401 });
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
      return NextResponse.json({ error: 'User authentication failed. Please log in again.' }, { status: 401 });
    }
    const { month, year, schedule } = await request.json();

    // Processing schedule save request

    if (month === undefined || month === null || !year || !schedule) {
      // Missing required fields for schedule save
      return NextResponse.json({ error: 'Month, year, and schedule are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;

    // Re-check the sign-up window, ownership, and capacity server-side. The
    // client enforces these too, but the API cannot trust the posted blob.
    const [userDoc, existingDoc] = await Promise.all([
      adminDb().collection('users').doc(user.uid).get(),
      adminDb().collection('schedules').doc(scheduleId).get(),
    ]);
    const userData = userDoc.data() || {};
    const existingSchedule = existingDoc.exists ? existingDoc.data()?.schedule ?? [] : [];

    const validation = validateScheduleSave({
      requester: {
        uid: user.uid,
        role: user.role,
        idNumber: userData.idNumber,
        name: userData.name,
        assignment: userData.assignment,
      },
      month: Number(month),
      year: Number(year),
      incomingSchedule: schedule,
      existingSchedule,
    });

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error ?? 'Schedule change not allowed.' },
        { status: validation.status ?? 400 }
      );
    }

    // Preparing to save schedule
    const scheduleData = {
      month,
      year,
      schedule,
      updatedAt: new Date().toISOString()
    };

    // Saving schedule data to database

    await adminDb().collection('schedules').doc(scheduleId).set(scheduleData, { merge: true });

    // Record who changed what. Audit failures must not undo a successful
    // save, so they are logged rather than surfaced to the client.
    try {
      const auditEntries = buildScheduleAuditEntries({
        actor: {
          uid: user.uid,
          name: userData.name,
          idNumber: userData.idNumber,
          role: user.role,
        },
        month: Number(month),
        year: Number(year),
        incomingSchedule: schedule,
        existingSchedule,
        timestamp: new Date().toISOString(),
      });
      if (auditEntries.length > 0) {
        const batch = adminDb().batch();
        const auditCollection = adminDb().collection('scheduleAudit');
        for (const entry of auditEntries) {
          batch.set(auditCollection.doc(), entry);
        }
        await batch.commit();
      }
    } catch (auditError) {
      console.error('Failed to write schedule audit entries:', auditError);
    }

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