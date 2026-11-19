import { NextRequest } from 'next/server';
import { z } from 'zod';
import { addRelative } from '@/lib/family-tree/store';
import { adminTreeEdit, idSchema, personDetailsSchema } from '@/lib/family-tree/admin-api';

const schema = z
  .object({
    relation: z.enum(['child', 'parent', 'partner', 'friend', 'sibling']),
    of: idSchema,
    existingId: idSchema.optional(),
    newPerson: personDetailsSchema.optional(),
    otherParentId: idSchema.optional(),
  })
  .refine((v) => !!v.existingId !== !!v.newPerson, { message: 'Pick a person or enter a new name.' });

// Add a relative (new or existing person) to someone in the tree.
export async function POST(req: NextRequest) {
  return adminTreeEdit(async (admin) => {
    const body = schema.parse(await req.json().catch(() => ({})));
    const id = await addRelative(body, admin);
    return { id };
  });
}
