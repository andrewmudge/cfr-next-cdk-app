import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { deleteMember, updateMember, MEMBER_STATUSES, type MemberStatus } from '@/lib/messaging/mailing-list';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { email } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as MemberStatus | undefined;
  if (status && !MEMBER_STATUSES.includes(status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  try {
    const updated = await updateMember(decodeURIComponent(email), {
      name: typeof body.name === 'string' ? body.name.slice(0, 120) : undefined,
      status,
    });
    if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/mailing-list failed', err);
    return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { email } = await params;
  try {
    await deleteMember(decodeURIComponent(email));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/mailing-list failed', err);
    return NextResponse.json({ error: 'Could not remove.' }, { status: 500 });
  }
}
