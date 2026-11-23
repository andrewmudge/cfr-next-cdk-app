import { NextRequest, NextResponse } from 'next/server';
import { loadTournament } from '@/lib/tournament/store';
import { summarize } from '@/lib/tournament/view';
import { GAME_IDS } from '@/lib/tournament/types';
import { badRequest, errorResponse, noStore, parseYear } from '@/lib/tournament/api';

export const dynamic = 'force-dynamic';

// Public: one summary card per game for the /tournament landing page.
export async function GET(req: NextRequest) {
  const year = parseYear(req.nextUrl.searchParams.get('year'));
  if (!year) return badRequest('Invalid year.');
  try {
    const states = await Promise.all(GAME_IDS.map((g) => loadTournament(year, g)));
    return NextResponse.json({ year, tournaments: GAME_IDS.map((g, i) => summarize(states[i], g, year)) }, { headers: noStore });
  } catch (err) {
    return errorResponse(err, 'GET /api/tournaments');
  }
}
