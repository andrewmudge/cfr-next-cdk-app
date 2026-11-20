import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { currentReunionYear } from '@/lib/reunion-config';
import { isEmail } from '@/lib/messaging/mailing-list';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  emailConfigured,
  listBroadcasts,
  queueBroadcast,
  type Audience,
} from '@/lib/messaging/broadcast';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ configured: emailConfigured(), broadcasts: await listBroadcasts() });
  } catch (err) {
    console.error('GET /api/admin/messages failed', err);
    return NextResponse.json({ error: 'Could not load send history.' }, { status: 500 });
  }
}

const schema = z.object({
  subject: z.string().trim().min(1, 'Add a subject.').max(200),
  body: z.string().trim().min(1, 'Write a message.').max(50_000),
  audience: z.enum(['everyone', 'thisYear', 'list']),
  emails: z.array(z.string()).max(5000).optional().default([]),
  test: z.boolean().optional().default(false),
  attachments: z
    .array(
      z.object({
        key: z.string().startsWith('email-attachments/').max(300),
        filename: z.string().min(1).max(150),
        contentType: z.string().refine((t) => t in ATTACHMENT_TYPES, 'That file type is not allowed.'),
        size: z.number().int().nonnegative(),
      })
    )
    .max(MAX_ATTACHMENTS)
    .optional()
    .default([]),
});

/** Queue an admin email. test: true sends only to the signed-in admin. */
export async function POST(req: NextRequest) {
  const admin = await getVerifiedAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const v = parsed.data;

  const total = v.attachments.reduce((n, a) => n + a.size, 0);
  if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Attachments are too big (25MB total max).' }, { status: 400 });
  }

  let audience: Audience;
  if (v.test) audience = { type: 'test' };
  else if (v.audience === 'everyone') audience = { type: 'everyone' };
  else if (v.audience === 'thisYear') audience = { type: 'thisYear', year: currentReunionYear() };
  else {
    const emails = [...new Set(v.emails.map((e) => e.trim().toLowerCase()).filter(isEmail))];
    if (!emails.length) return NextResponse.json({ error: 'Pick at least one person.' }, { status: 400 });
    audience = { type: 'list', emails };
  }

  try {
    const record = await queueBroadcast({
      kind: 'email',
      createdBy: admin,
      subject: v.subject,
      body: v.body,
      attachments: v.attachments,
      audience,
    });
    return NextResponse.json({ ok: true, broadcastId: record.broadcastId }, { status: 202 });
  } catch (err) {
    console.error('POST /api/admin/messages failed', err);
    return NextResponse.json({ error: 'Could not start the send.' }, { status: 500 });
  }
}
