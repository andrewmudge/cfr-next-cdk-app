import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { setMemberVerified } from '@/lib/reunion-db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    await setMemberVerified(id, body.verified !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/people failed', err);
    return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  }
}
