import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { listSubmissions, listFamilyMemberRecords } from '@/lib/reunion-db';
import { REUNION_YEAR } from '@/lib/reunion-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [submissions, members] = await Promise.all([listSubmissions(REUNION_YEAR), listFamilyMemberRecords(true)]);
    const unverified = members
      .filter((m) => m.source === 'registration' && !m.verified)
      .map((m) => ({ personId: m.personId, displayName: m.displayName, createdAt: m.createdAt }));
    return NextResponse.json({ year: REUNION_YEAR, submissions, unverified });
  } catch (err) {
    console.error('GET /api/admin/registrations failed', err);
    return NextResponse.json({ error: 'Could not load registrations.' }, { status: 500 });
  }
}
