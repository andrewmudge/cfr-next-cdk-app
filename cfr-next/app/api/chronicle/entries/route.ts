import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listFamilyMemberRecords } from '@/lib/reunion-db';
import { titleCase } from '@/lib/reunion-config';
import { MAX_CONTENT_CHARS, MAX_PHOTOS, currentIssueId, issueInfo, isIssueId, nextIssueId } from '@/lib/chronicle/issues';
import { createEntry } from '@/lib/chronicle/db';
import { photoExists, photoPrefix } from '@/lib/chronicle/storage';

export const dynamic = 'force-dynamic';

const name = z.string().trim().max(60);

const schema = z.object({
  submitter: z.union([
    z.object({ personId: z.string().trim().min(1).max(100) }),
    z.object({ newName: z.object({ given: name.min(1), family: name }) }),
  ]),
  content: z.string().trim().max(MAX_CONTENT_CHARS, `Please keep it under ${MAX_CONTENT_CHARS} characters.`),
  /** The issue the photos were uploaded for (from /api/chronicle/uploads). */
  issueId: z.string().optional(),
  photos: z
    .array(
      z.object({
        key: z.string().max(200),
        width: z.number().int().min(1).max(10_000),
        height: z.number().int().min(1).max(10_000),
      })
    )
    .max(MAX_PHOTOS, `You can add up to ${MAX_PHOTOS} photos.`)
    .default([]),
  website: z.string().optional(), // honeypot — real users never fill this
});

/** Public: add an update to the next Churchwell Chronicle. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }
  const v = parsed.data;
  if (!v.content && v.photos.length === 0) {
    return NextResponse.json({ error: 'Write a few words or add a photo.' }, { status: 400 });
  }

  // The current issue, unless the photos were uploaded just before a cutoff:
  // then keep them together in the issue they were uploaded for.
  const now = currentIssueId();
  const issueId = v.issueId && isIssueId(v.issueId) && (v.issueId === now || nextIssueId(v.issueId) === now) ? v.issueId : now;

  // Bot filled the honeypot: pretend success, store nothing.
  if (v.website) return NextResponse.json({ ok: true, issue: issueInfo(issueId) }, { status: 201 });

  try {
    let personId: string | undefined;
    let displayName: string;
    if ('personId' in v.submitter) {
      const id = v.submitter.personId;
      const member = (await listFamilyMemberRecords()).find((m) => m.personId === id);
      if (!member) return NextResponse.json({ error: "We couldn't find that name. Please pick it again." }, { status: 400 });
      personId = member.personId;
      displayName = member.displayName;
    } else {
      displayName = titleCase(`${v.submitter.newName.given} ${v.submitter.newName.family}`.trim());
    }

    const prefix = photoPrefix(issueId);
    if (v.photos.some((p) => !p.key.startsWith(prefix) || !/^[\w/-]+\.jpg$/.test(p.key))) {
      return NextResponse.json({ error: 'One of the photos did not upload correctly. Please remove it and add it again.' }, { status: 400 });
    }
    const exists = await Promise.all(v.photos.map((p) => photoExists(p.key)));
    if (exists.includes(false)) {
      return NextResponse.json({ error: 'One of the photos did not finish uploading. Please remove it and add it again.' }, { status: 400 });
    }

    await createEntry({ issueId, personId, displayName, content: v.content, photos: v.photos });
    return NextResponse.json({ ok: true, issue: issueInfo(issueId) }, { status: 201 });
  } catch (err) {
    console.error('POST /api/chronicle/entries failed', err);
    return NextResponse.json({ error: 'Something went wrong saving your update. Please try again.' }, { status: 500 });
  }
}
