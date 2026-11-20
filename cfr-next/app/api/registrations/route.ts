import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createRegistration } from '@/lib/reunion-db';
import {
  ACTIVITY_IDS,
  ADULT_RATE_IDS,
  AGE_GROUP_IDS,
  MAX_ATTENDEES,
  MAX_DOGS,
  currentReunionYear,
  formatReunionDates,
  ordinal,
  reunionNumber,
} from '@/lib/reunion-config';
import { cleanPhoneNumber } from '@/lib/phone-utils';
import { emailConfigured, queueBroadcast } from '@/lib/messaging/broadcast';
import { getSiteSettings } from '@/lib/site-settings';

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
      .array(
        z.object({
          person: personRef,
          ageGroup: z.enum(AGE_GROUP_IDS, { message: 'Please pick an age group for everyone.' }),
          adultRate: z.enum(ADULT_RATE_IDS).optional(),
          activities: z.array(z.enum(ACTIVITY_IDS)).max(ACTIVITY_IDS.length),
        })
      )
      .min(1, 'Add at least one person who is coming.')
      .max(MAX_ATTENDEES, `Please register at most ${MAX_ATTENDEES} people at a time.`),
    useContactOnFile: z.boolean().optional().default(false),
    dogs: z.number().int().min(0).max(MAX_DOGS).optional().default(0),
    notes: z.string().trim().max(1000).optional().default(''),
    website: z.string().optional(), // honeypot — real users never fill this
  })
  .superRefine((v, ctx) => {
    v.attendees.forEach((a, i) => {
      if (a.adultRate && a.ageGroup !== 'adult') {
        ctx.addIssue({ code: 'custom', path: ['attendees', i, 'adultRate'], message: 'Day visitor and grandfather rates are for adults.' });
      }
    });
    const emailOk = v.email === '' || z.string().email().safeParse(v.email).success;
    if (!emailOk) ctx.addIssue({ code: 'custom', path: ['email'], message: 'That email address looks off.' });
    const digits = cleanPhoneNumber(v.phone);
    if (v.phone && digits.length !== 10) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone number should be 10 digits.' });
    }
    const onFile = v.useContactOnFile && 'personId' in v.submitter;
    if (!v.email && !v.phone && !onFile) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Please give us an email or a phone number.' });
    }
  });

export async function POST(req: NextRequest) {
  // The admin can close sign-ups; refuse even if someone still has the form open.
  try {
    if (!(await getSiteSettings()).signupsOpen) {
      return NextResponse.json({ error: 'Sign-ups are closed right now.' }, { status: 403 });
    }
  } catch (err) {
    console.error('Reading site settings failed; allowing sign-up', err);
  }

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
  if (v.website) return NextResponse.json({ ok: true, attendees: [], lines: [], totalCents: 0 }, { status: 201 });

  const year = currentReunionYear();
  try {
    const result = await createRegistration({
      year,
      submitter: v.submitter,
      email: v.email.toLowerCase(),
      phone: v.phone ? `+1${cleanPhoneNumber(v.phone)}` : '',
      useContactOnFile: v.useContactOnFile,
      attendees: v.attendees.map((a) => ({
        person: a.person,
        ageGroup: a.ageGroup,
        adultRate: a.adultRate,
        activities: a.activities,
      })),
      dogs: v.dogs,
      notes: v.notes,
    });
    if (result.ok) {
      // Confirmation email to this family.
      // Runs after the response is sent; a failure here never fails the sign-up.
      if (emailConfigured()) {
        const submissionId = result.submissionId;
        after(async () => {
          try {
            const y = Number(year);
            await queueBroadcast({
              kind: 'signup',
              year,
              submissionId,
              reunionLabel: `${ordinal(reunionNumber(y))} annual Churchwell Family Reunion (${formatReunionDates(y, 'short')})`,
            });
          } catch (err) {
            console.error('Queueing sign-up emails failed', submissionId, err);
          }
        });
      }
      return NextResponse.json(result, { status: 201 });
    }
    if (result.reason === 'already_registered') {
      return NextResponse.json({ error: 'already_registered', alreadyRegistered: result.alreadyRegistered }, { status: 409 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  } catch (err) {
    console.error('POST /api/registrations failed', err);
    return NextResponse.json({ error: 'Something went wrong saving your sign-up. Please try again.' }, { status: 500 });
  }
}
