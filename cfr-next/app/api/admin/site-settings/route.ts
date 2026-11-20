import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { setSiteSettings } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const admin = await getVerifiedAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.signupsOpen !== 'boolean') return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });
  try {
    return NextResponse.json(await setSiteSettings({ signupsOpen: body.signupsOpen }, admin));
  } catch (err) {
    console.error('PUT /api/admin/site-settings failed', err);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
}
