import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { syncMailingListFromSite } from '@/lib/messaging/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, result: await syncMailingListFromSite() });
  } catch (err) {
    console.error('POST /api/admin/mailing-list/sync failed', err);
    return NextResponse.json({ error: 'Sync failed.' }, { status: 500 });
  }
}
