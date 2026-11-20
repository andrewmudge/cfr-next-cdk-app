import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { isIssueId } from '@/lib/chronicle/issues';
import { getIssue, saveMeta } from '@/lib/chronicle/db';
import { renderChroniclePdf } from '@/lib/chronicle/pdf';
import { publicUrl, savePdf } from '@/lib/chronicle/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({ issueId: z.string().refine(isIssueId) });

/** Admin: build the PDF from approved entries and publish it (public link). Safe to re-run after edits. */
export async function POST(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid issue.' }, { status: 400 });
  const { issueId } = parsed.data;
  try {
    const { meta, entries } = await getIssue(issueId);
    const approved = entries.filter((e) => e.status === 'approved');
    if (approved.length === 0) return NextResponse.json({ error: 'Approve at least one entry first.' }, { status: 400 });
    const pdf = await renderChroniclePdf(meta, approved);
    const pdfKey = await savePdf(issueId, pdf);
    const next = await saveMeta(issueId, {
      pdfKey,
      pdfBytes: pdf.length,
      finalizedAt: new Date().toISOString(),
      status: meta.status === 'sent' ? 'sent' : 'final',
    });
    return NextResponse.json({ meta: next, pdfUrl: publicUrl(pdfKey) });
  } catch (err) {
    console.error('POST /api/admin/chronicle/finalize failed', err);
    return NextResponse.json({ error: 'Could not build the PDF.' }, { status: 500 });
  }
}
