import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  presignAttachmentUploads,
} from '@/lib/messaging/broadcast';

export const dynamic = 'force-dynamic';

const schema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        type: z.string().refine((t) => t in ATTACHMENT_TYPES, 'Only PDF, image and Word files can be attached.'),
        size: z.number().int().positive(),
      })
    )
    .min(1)
    .max(MAX_ATTACHMENTS, `Attach at most ${MAX_ATTACHMENTS} files.`),
});

/** Presigned S3 upload URLs for email attachments (the browser uploads directly). */
export async function POST(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const total = parsed.data.files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Attachments are too big (25MB total max).' }, { status: 400 });
  }
  try {
    return NextResponse.json({ uploads: await presignAttachmentUploads(parsed.data.files) });
  } catch (err) {
    console.error('POST /api/admin/messages/attachments failed', err);
    return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 });
  }
}
