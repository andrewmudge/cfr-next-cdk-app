import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { TreeEditError } from './store';

export const personDetailsSchema = z.object({
  given: z.string().trim().min(1, 'Please enter a first name.').max(60),
  family: z.string().trim().max(60).default(''),
  nickname: z.string().trim().max(40).optional(),
  gender: z.enum(['M', 'F']).optional(),
  deceased: z.boolean().optional(),
  born: z.number().int().min(1700).max(2100).optional(),
  died: z.number().int().min(1700).max(2100).optional(),
});

export const idSchema = z.string().trim().min(1).max(100);

/** Wraps an admin tree edit: checks the admin login, validates, and turns errors into friendly JSON. */
export async function adminTreeEdit(handler: (admin: string) => Promise<unknown>) {
  const admin = await getVerifiedAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await handler(admin);
    return NextResponse.json({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
  } catch (err) {
    if (err instanceof TreeEditError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
    console.error('Family tree edit failed', err);
    return NextResponse.json({ error: 'Something went wrong saving that change.' }, { status: 500 });
  }
}
