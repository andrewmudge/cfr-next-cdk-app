import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { removeAttendee } from '@/lib/reunion-db';
import { yearParam } from '@/lib/reunion-config';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ submissionId: string; personId: string }> }
) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { submissionId, personId } = await params;
  try {
    const result = await removeAttendee(yearParam(req.url), submissionId, personId);
    if (result === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('DELETE /api/admin/registrations/.../people failed', err);
    return NextResponse.json({ error: 'Could not remove.' }, { status: 500 });
  }
}
