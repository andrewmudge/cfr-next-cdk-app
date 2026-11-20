import { NextResponse } from 'next/server';
import { getSiteSettings } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';

/** Public: what the home page needs to know (e.g. whether sign-ups are open). */
export async function GET() {
  try {
    const { signupsOpen, chronicleOpen } = await getSiteSettings();
    return NextResponse.json({ signupsOpen, chronicleOpen }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/site-settings failed', err);
    return NextResponse.json({ error: 'Could not load settings.' }, { status: 500 });
  }
}
