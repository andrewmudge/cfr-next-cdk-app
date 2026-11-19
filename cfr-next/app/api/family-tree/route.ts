import { NextResponse } from 'next/server';
import { loadFamilyTree } from '@/lib/family-tree/parse';

// Built once per deploy from public/FamilyTree.html: replace that file + deploy to update the tree.
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(loadFamilyTree());
}
