import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { isIssueId } from '@/lib/chronicle/issues';
import { getIssue } from '@/lib/chronicle/db';
import { renderChroniclePdf } from '@/lib/chronicle/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Admin: preview the PDF from the approved entries, without saving it. ?issue=YYYY-MM */
export async function GET(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const issueId = req.nextUrl.searchParams.get('issue');
  if (!isIssueId(issueId)) return NextResponse.json({ error: 'Invalid issue.' }, { status: 400 });
  try {
    const { meta, entries } = await getIssue(issueId);
    const pdf = await renderChroniclePdf(meta, entries.filter((e) => e.status === 'approved'));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Churchwell-Chronicle-${issueId}-preview.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/admin/chronicle/pdf failed', err);
    return NextResponse.json({ error: 'Could not build the PDF.' }, { status: 500 });
  }
}
