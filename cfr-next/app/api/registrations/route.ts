import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRegistration } from '@/lib/reunion-db';
import { ACTIVITY_IDS, MAX_ATTENDEES, REUNION_YEAR } from '@/lib/reunion-config';
import { cleanPhoneNumber } from '@/lib/phone-utils';

export const dynamic = 'force-dynamic';

const name = z.string().trim().max(60);
const personRef = z.union([
  z.object({ personId: z.string().trim().min(1).max(100) }),
  z.object({ newName: z.object({ given: name.min(1), family: name }) }),
]);

const schema = z
  .object({
    submitter: personRef,
    email: z.string().trim().max(200).optional().default(''),
    phone: z.string().trim().max(30).optional().default(''),
    attendees: z
      .array(z.object({ person: personRef, activities: z.array(z.enum(ACTIVITY_IDS)).max(ACTIVITY_IDS.length) }))
      .min(1, 'Add at least one person who is coming.')
      .max(MAX_ATTENDEES, `Please register at most ${MAX_ATTENDEES} people at a time.`),
    notes: z.string().trim().max(1000).optional().default(''),
    website: z.string().optional(), // honeypot — real users never fill this
  })
  .superRefine((v, ctx) => {
    const emailOk = v.email === '' || z.string().email().safeParse(v.email).success;
    if (!emailOk) ctx.addIssue({ code: 'custom', path: ['email'], message: 'That email address looks off.' });
    const digits = cleanPhoneNumber(v.phone);
    if (v.phone && digits.length !== 10) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone number should be 10 digits.' });
    }
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Please give us an email or a phone number.' });
    }
  });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }
  const v = parsed.data;

  // Bot filled the honeypot: pretend success, store nothing.
  if (v.website) return NextResponse.json({ ok: true, attendees: [] }, { status: 201 });

  try {
    const result = await createRegistration({
      year: REUNION_YEAR,
      submitter: v.submitter,
      email: v.email.toLowerCase(),
      phone: v.phone ? `+1${cleanPhoneNumber(v.phone)}` : '',
      attendees: v.attendees.map((a) => ({ person: a.person, activities: a.activities })),
      notes: v.notes,
    });
    if (result.ok) return NextResponse.json(result, { status: 201 });
    if (result.reason === 'already_registered') {
      return NextResponse.json({ error: 'already_registered', alreadyRegistered: result.alreadyRegistered }, { status: 409 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  } catch (err) {
    console.error('POST /api/registrations failed', err);
    return NextResponse.json({ error: 'Something went wrong saving your sign-up. Please try again.' }, { status: 500 });
  }
}
