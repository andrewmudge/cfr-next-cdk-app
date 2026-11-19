import { NextResponse } from 'next/server';
import { loadTreeData } from '@/lib/family-tree/store';

// Read from the FamilyMembers table (edited on the site by the admin). Public: no contact info.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await loadTreeData(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/family-tree failed', err);
    return NextResponse.json({ error: 'Could not load the family tree.' }, { status: 500 });
  }
}
