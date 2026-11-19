import { NextRequest } from 'next/server';
import { removeFromTree, updatePerson } from '@/lib/family-tree/store';
import { adminTreeEdit, idSchema, personDetailsSchema } from '@/lib/family-tree/admin-api';

type Ctx = { params: Promise<{ id: string }> };

// Edit someone's details.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return adminTreeEdit(async (admin) => {
    const id = idSchema.parse((await params).id);
    const details = personDetailsSchema.parse(await req.json().catch(() => ({})));
    await updatePerson(id, details, admin);
  });
}

// Take someone out of the tree (their sign-up name and registrations are kept).
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return adminTreeEdit(async (admin) => {
    await removeFromTree(idSchema.parse((await params).id), admin);
  });
}
