import { NextRequest, NextResponse } from 'next/server';
import { listEvents, loadTournament } from '@/lib/tournament/store';
import { getActor } from '@/lib/tournament/auth';
import { badRequest, errorResponse, noStore, parseGame, parseYear } from '@/lib/tournament/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ game: string }> };

/** Audit log, newest first. Managers and admins only. */
export async function GET(req: NextRequest, { params }: Params) {
  const game = parseGame((await params).game);
  const year = parseYear(req.nextUrl.searchParams.get('year'));
  if (!game || !year) return badRequest('Unknown tournament.');
  try {
    const actor = await getActor(year, game, await loadTournament(year, game));
    if (actor.role === 'spectator') return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
    const events = (await listEvents(year, game, 300)).map((e) => {
      const { sk, ...rest } = e;
      void sk;
      return rest;
    });
    return NextResponse.json({ events }, { headers: noStore });
  } catch (err) {
    return errorResponse(err, 'GET /api/tournaments/[game]/events');
  }
}
