import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/api-auth';
import type { ScheduleAuditEntry } from '@/lib/schedule-audit';

export async function GET(request: NextRequest) {
  try {
    // Only admins can read the schedule audit trail
    await requireAdmin(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.includes('Forbidden') ? 403 : 401;
    return NextResponse.json({ error: 'Admin access required' }, { status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (month === null || year === null) {
      return NextResponse.json({ error: 'Month and year are required' }, { status: 400 });
    }

    // Single-field equality keeps us off composite indexes; entries per month
    // are few, so sorting in memory is fine.
    const snapshot = await adminDb()
      .collection('scheduleAudit')
      .where('monthKey', '==', `${year}-${month}`)
      .get();

    const entries = snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as ScheduleAuditEntry) }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching schedule audit entries:', error);
    return NextResponse.json({ error: 'Failed to fetch audit entries' }, { status: 500 });
  }
}
