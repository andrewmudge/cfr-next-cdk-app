import { NextResponse } from 'next/server';
import { listPublicPeople, getRegisteredPeople } from '@/lib/reunion-db';
import { REUNION_YEAR } from '@/lib/reunion-config';

export const dynamic = 'force-dynamic';

// Public: names only (no contact info) + who is already registered this year.
export async function GET() {
  try {
    const [people, registered] = await Promise.all([listPublicPeople(), getRegisteredPeople(REUNION_YEAR)]);
    return NextResponse.json({ year: REUNION_YEAR, people, registered });
  } catch (err) {
    console.error('GET /api/people failed', err);
    return NextResponse.json({ error: 'Could not load the family list.' }, { status: 500 });
  }
}
