import { NextRequest } from 'next/server';
import { z } from 'zod';
import { link, unlink } from '@/lib/family-tree/store';
import { adminTreeEdit, idSchema } from '@/lib/family-tree/admin-api';

// a = parent / partner / friend; b = child / other partner / other friend.
const schema = z.object({
  type: z.enum(['parent', 'partner', 'friend']),
  a: idSchema,
  b: idSchema,
  current: z.boolean().optional(),
});

// Add a link, or make a partner current, or switch partner <-> friend.
export async function POST(req: NextRequest) {
  return adminTreeEdit(async (admin) => {
    const v = schema.parse(await req.json().catch(() => ({})));
    await link(v.type, v.a, v.b, admin, { current: v.current });
  });
}

export async function DELETE(req: NextRequest) {
  return adminTreeEdit(async (admin) => {
    const v = schema.parse(await req.json().catch(() => ({})));
    await unlink(v.type, v.a, v.b, admin);
  });
}
