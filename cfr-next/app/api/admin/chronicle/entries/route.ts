import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { MAX_CONTENT_CHARS, isIssueId } from '@/lib/chronicle/issues';
import { deleteEntry, getEntry, updateEntry } from '@/lib/chronicle/db';
import { deletePhotos } from '@/lib/chronicle/storage';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const issueId = z.string().refine(isIssueId);
const sk = z.string().startsWith('ENTRY#').max(200);

const patchSchema = z.object({
  issueId,
  sk,
  displayName: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().max(MAX_CONTENT_CHARS).optional(),
  status: z.enum(['submitted', 'approved', 'hidden']).optional(),
  /** Drop one photo from the entry (and delete it from S3). */
  removePhotoKey: z.string().max(200).optional(),
});

/** Admin: edit an entry. */
export async function PATCH(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return unauthorized();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const { issueId, sk, removePhotoKey, ...patch } = parsed.data;
  try {
    let photos;
    if (removePhotoKey) {
      const entry = await getEntry(issueId, sk);
      if (!entry) return NextResponse.json({ error: 'That entry no longer exists.' }, { status: 404 });
      photos = entry.photos.filter((p) => p.key !== removePhotoKey);
    }
    const entry = await updateEntry(issueId, sk, { ...patch, photos });
    if (!entry) return NextResponse.json({ error: 'That entry no longer exists.' }, { status: 404 });
    if (removePhotoKey) await deletePhotos([removePhotoKey]).catch((err) => console.error('Chronicle photo delete failed', err));
    return NextResponse.json({ entry });
  } catch (err) {
    console.error('PATCH /api/admin/chronicle/entries failed', err);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
}

const orderSchema = z.object({ issueId, order: z.array(sk).max(500) });

/** Admin: set the running order (array of entry sort keys, first = top of the PDF). */
export async function PUT(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return unauthorized();
  const parsed = orderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    await Promise.all(parsed.data.order.map((s, i) => updateEntry(parsed.data.issueId, s, { order: i })));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/admin/chronicle/entries failed', err);
    return NextResponse.json({ error: 'Could not save the order.' }, { status: 500 });
  }
}

const deleteSchema = z.object({ issueId, sk });

/** Admin: permanently delete an entry and its photos. */
export async function DELETE(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return unauthorized();
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const old = await deleteEntry(parsed.data.issueId, parsed.data.sk);
    if (old?.photos.length) {
      await deletePhotos(old.photos.map((p) => p.key)).catch((err) => console.error('Chronicle photo delete failed', err));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/chronicle/entries failed', err);
    return NextResponse.json({ error: 'Could not delete.' }, { status: 500 });
  }
}
