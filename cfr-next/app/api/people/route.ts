import { NextResponse } from 'next/server';
import { listPublicPeople, getRegisteredPeople } from '@/lib/reunion-db';
import { currentReunionYear } from '@/lib/reunion-config';

export const dynamic = 'force-dynamic';

// Public: names only (no contact info) + who is already registered this year.
export async function GET() {
  try {
    const year = currentReunionYear();
    const [people, registered] = await Promise.all([listPublicPeople(), getRegisteredPeople(year)]);
    return NextResponse.json({ year, people, registered });
  } catch (err) {
    console.error('GET /api/people failed', err);
    return NextResponse.json({ error: 'Could not load the family list.' }, { status: 500 });
  }
}
