import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_PHOTOS, currentIssueId } from '@/lib/chronicle/issues';
import { presignPhotoUploads, storageConfigured } from '@/lib/chronicle/storage';
import { getSiteSettings } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';

const schema = z.object({ count: z.number().int().min(1).max(MAX_PHOTOS) });

/**
 * Public: presigned S3 POSTs for Chronicle photos. The browser uploads straight to S3
 * (no 4.5MB Vercel body limit), and S3 enforces the size cap and JPEG type.
 */
export async function POST(req: NextRequest) {
  if (!(await getSiteSettings()).chronicleOpen) {
    return NextResponse.json({ error: 'The Chronicle is not taking updates right now.' }, { status: 403 });
  }
  if (!storageConfigured()) return NextResponse.json({ error: 'Photo uploads are not set up yet.' }, { status: 503 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `You can add up to ${MAX_PHOTOS} photos.` }, { status: 400 });
  try {
    const issueId = currentIssueId();
    const uploads = await presignPhotoUploads(issueId, parsed.data.count);
    return NextResponse.json({ issueId, uploads });
  } catch (err) {
    console.error('POST /api/chronicle/uploads failed', err);
    return NextResponse.json({ error: 'Could not start the photo upload. Please try again.' }, { status: 500 });
  }
}
