import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { getMember, isEmail, listMembers, upsertMembers } from '@/lib/messaging/mailing-list';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const members = await listMembers();
    // Tokens are only for unsubscribe links; the admin UI never needs them.
    return NextResponse.json({
      members: members.map((m) => ({ email: m.email, name: m.name, sources: m.sources, status: m.status, statusReason: m.statusReason, addedAt: m.addedAt })),
    });
  } catch (err) {
    console.error('GET /api/admin/mailing-list failed', err);
    return NextResponse.json({ error: 'Could not load the mailing list.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim();
  const name = String(body.name || '').trim().slice(0, 120);
  if (!isEmail(email)) return NextResponse.json({ error: 'That email address looks off.' }, { status: 400 });
  try {
    if (await getMember(email)) return NextResponse.json({ error: 'That address is already on the list.' }, { status: 409 });
    await upsertMembers([{ email, name }], 'manual');
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/mailing-list failed', err);
    return NextResponse.json({ error: 'Could not add that address.' }, { status: 500 });
  }
}
