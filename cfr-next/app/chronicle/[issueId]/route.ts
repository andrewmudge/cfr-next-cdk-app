import { NextResponse } from 'next/server';
import { isIssueId } from '@/lib/chronicle/issues';
import { getIssue } from '@/lib/chronicle/db';
import { publicUrl } from '@/lib/chronicle/storage';

export const dynamic = 'force-dynamic';

/** Friendly, permanent link for emails: /chronicle/2027-01 -> the finalized PDF on S3. */
export async function GET(req: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const id = issueId.replace(/\.pdf$/, '');
  if (isIssueId(id)) {
    const { meta } = await getIssue(id);
    if (meta.pdfKey) return NextResponse.redirect(publicUrl(meta.pdfKey), 302);
  }
  return NextResponse.redirect(new URL('/chronicle', req.url), 302);
}
