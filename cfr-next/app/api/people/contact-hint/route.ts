import { NextRequest, NextResponse } from 'next/server';
import { getContactHint } from '@/lib/reunion-db';

export const dynamic = 'force-dynamic';

// Public: returns only MASKED contact info (j•••@yahoo.com, (•••) •••-6494), never the real values.
export async function GET(req: NextRequest) {
  const personId = req.nextUrl.searchParams.get('personId')?.trim();
  if (!personId || personId.length > 100) return NextResponse.json({ error: 'personId is required' }, { status: 400 });
  try {
    return NextResponse.json({ onFile: await getContactHint(personId) });
  } catch (err) {
    console.error('GET /api/people/contact-hint failed', err);
    return NextResponse.json({ onFile: null });
  }
}
