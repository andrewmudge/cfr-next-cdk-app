import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { currentIssueId, isIssueId, issueInfo, nextIssueId, previousIssueId } from '@/lib/chronicle/issues';
import { getIssue, saveMeta } from '@/lib/chronicle/db';
import { publicUrl, signedPhotoUrl } from '@/lib/chronicle/storage';
import { emailConfigured } from '@/lib/messaging/broadcast';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

/** Admin: one issue's entries (with viewable photo links) + its status. ?issue=YYYY-MM */
export async function GET(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return unauthorized();
  const current = currentIssueId();
  const q = req.nextUrl.searchParams.get('issue');
  const issueId = isIssueId(q) ? q : current;
  try {
    const { meta, entries } = await getIssue(issueId);
    const withUrls = await Promise.all(
      entries.map(async (e) => ({
        ...e,
        photos: await Promise.all(e.photos.map(async (p) => ({ ...p, url: await signedPhotoUrl(p.key) }))),
      }))
    );
    // Recent issues for the picker: two back and one ahead of the one being collected.
    const issues = [previousIssueId(previousIssueId(current)), previousIssueId(current), current, nextIssueId(current)];
    if (!issues.includes(issueId)) issues.unshift(issueId);
    return NextResponse.json({
      issue: issueInfo(issueId),
      currentIssueId: current,
      issues: issues.map(issueInfo),
      meta,
      pdfUrl: meta.pdfKey ? publicUrl(meta.pdfKey) : null,
      entries: withUrls,
      emailConfigured: emailConfigured(),
    });
  } catch (err) {
    console.error('GET /api/admin/chronicle failed', err);
    return NextResponse.json({ error: 'Could not load the Chronicle.' }, { status: 500 });
  }
}

const metaSchema = z.object({
  issueId: z.string().refine(isIssueId),
  intro: z.string().trim().max(3000),
});

/** Admin: save the editor's note. */
export async function PUT(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return unauthorized();
  const parsed = metaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const meta = await saveMeta(parsed.data.issueId, { intro: parsed.data.intro || undefined });
    return NextResponse.json({ meta });
  } catch (err) {
    console.error('PUT /api/admin/chronicle failed', err);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
}
