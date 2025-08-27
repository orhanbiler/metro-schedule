import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';

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

    if (!month || !year || !schedule) {
      return NextResponse.json({ error: 'Month, year, and schedule are required' }, { status: 400 });
    }

    const scheduleId = `${year}-${month}`;
    const scheduleRef = doc(db, 'schedules', scheduleId);
    
    await setDoc(scheduleRef, {
      month,
      year,
      schedule,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving schedule:', error);
    return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 });
  }
}