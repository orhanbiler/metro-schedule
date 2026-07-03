import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/api-auth';

/**
 * Per-user acknowledgment of one-time in-app notices (e.g. the scheduling
 * rules popup). Stored on the user's own document under `acknowledgedNotices`
 * so an acknowledgment follows the account across devices.
 */

const KEY_PATTERN = /^[a-z0-9-]{1,64}$/;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const key = new URL(request.url).searchParams.get('key') || '';
    if (!KEY_PATTERN.test(key)) {
      return NextResponse.json({ error: 'A valid notice key is required' }, { status: 400 });
    }

    const doc = await adminDb().collection('users').doc(user.uid).get();
    const acknowledged = Boolean(doc.data()?.acknowledgedNotices?.[key]);
    return NextResponse.json({ acknowledged });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { key } = await request.json();
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      return NextResponse.json({ error: 'A valid notice key is required' }, { status: 400 });
    }

    await adminDb().collection('users').doc(user.uid).set(
      { acknowledgedNotices: { [key]: new Date().toISOString() } },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
