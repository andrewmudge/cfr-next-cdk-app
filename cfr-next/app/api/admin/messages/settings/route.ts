import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { getSettings, saveSettings } from '@/lib/messaging/broadcast';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getSettings());
  } catch (err) {
    console.error('GET /api/admin/messages/settings failed', err);
    return NextResponse.json({ error: 'Could not load settings.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.announceSignups !== 'boolean') return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });
  try {
    return NextResponse.json(await saveSettings({ announceSignups: body.announceSignups }));
  } catch (err) {
    console.error('PUT /api/admin/messages/settings failed', err);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
}
