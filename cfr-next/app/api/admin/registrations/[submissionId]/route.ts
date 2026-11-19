import { NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { deleteSubmission } from '@/lib/reunion-db';
import { REUNION_YEAR } from '@/lib/reunion-config';

export async function DELETE(_req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { submissionId } = await params;
  try {
    const ok = await deleteSubmission(REUNION_YEAR, submissionId);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err) {
    console.error('DELETE /api/admin/registrations failed', err);
    return NextResponse.json({ error: 'Could not delete.' }, { status: 500 });
  }
}
