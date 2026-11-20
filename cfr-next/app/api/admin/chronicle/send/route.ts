import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { CHRONICLE_NAME, isIssueId, issueInfo, nextIssueId } from '@/lib/chronicle/issues';
import { getIssue, saveMeta } from '@/lib/chronicle/db';
import { emailConfigured, queueBroadcast } from '@/lib/messaging/broadcast';

export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://churchwellreunion.com').replace(/\/$/, '');

const schema = z.object({
  issueId: z.string().refine(isIssueId),
  /** true: send only to the signed-in admin. */
  test: z.boolean().optional().default(false),
});

const listNames = (names: string[]) => {
  if (names.length <= 1) return names.join('');
  const shown = names.slice(0, 5);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

/** Admin: email the master list a link to the finalized issue (via the existing broadcast Lambda). */
export async function POST(req: NextRequest) {
  const admin = await getVerifiedAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ error: 'Email sending is not set up yet.' }, { status: 503 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { issueId, test } = parsed.data;

  try {
    const { meta, entries } = await getIssue(issueId);
    if (!meta.pdfKey) return NextResponse.json({ error: 'Finalize the PDF before sending.' }, { status: 400 });
    if (meta.status === 'sent' && !test) {
      return NextResponse.json({ error: 'This issue was already sent to the master list.' }, { status: 409 });
    }

    const info = issueInfo(issueId);
    const next = issueInfo(nextIssueId(issueId));
    const names = [...new Set(entries.filter((e) => e.status === 'approved').map((e) => e.displayName))];
    const body = [
      `The ${info.label} edition of ${CHRONICLE_NAME} is here, with news from ${listNames(names)}.`,
      `**Read it here:** ${SITE_URL}/chronicle/${issueId}`,
      `Have news to share? Send your update for the ${next.label} edition by ${next.cutoffLabel}: ${SITE_URL}/chronicle`,
    ].join('\n\n');

    const record = await queueBroadcast({
      kind: 'email',
      createdBy: admin,
      subject: `${CHRONICLE_NAME} — ${info.label}`,
      body,
      audience: test ? { type: 'test' } : { type: 'everyone' },
    });
    if (!test) await saveMeta(issueId, { status: 'sent', sentAt: new Date().toISOString(), broadcastId: record.broadcastId });
    return NextResponse.json({ ok: true, broadcastId: record.broadcastId }, { status: 202 });
  } catch (err) {
    console.error('POST /api/admin/chronicle/send failed', err);
    return NextResponse.json({ error: 'Could not start the send.' }, { status: 500 });
  }
}
