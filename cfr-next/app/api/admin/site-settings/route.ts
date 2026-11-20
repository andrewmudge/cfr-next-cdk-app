import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { setSiteSettings, type SiteSettings } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const admin = await getVerifiedAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // Each switch is sent on its own; accept whichever boolean switches are present.
  const patch: Partial<SiteSettings> = {};
  if (typeof body.signupsOpen === 'boolean') patch.signupsOpen = body.signupsOpen;
  if (typeof body.chronicleOpen === 'boolean') patch.chronicleOpen = body.chronicleOpen;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });
  try {
    return NextResponse.json(await setSiteSettings(patch, admin));
  } catch (err) {
    console.error('PUT /api/admin/site-settings failed', err);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
}
