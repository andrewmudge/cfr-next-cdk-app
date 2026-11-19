import { NextRequest, NextResponse } from 'next/server';
import { getRegisteredPerson } from '@/lib/reunion-db';
import { REUNION_YEAR } from '@/lib/reunion-config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const personId = req.nextUrl.searchParams.get('personId')?.trim();
  if (!personId || personId.length > 100) {
    return NextResponse.json({ error: 'personId is required' }, { status: 400 });
  }
  try {
    const reg = await getRegisteredPerson(REUNION_YEAR, personId);
    return NextResponse.json(reg ? { registered: true, ...reg } : { registered: false });
  } catch (err) {
    console.error('GET /api/registrations/check failed', err);
    return NextResponse.json({ error: 'Could not check registration.' }, { status: 500 });
  }
}
