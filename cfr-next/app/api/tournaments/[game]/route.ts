import { NextRequest, NextResponse } from 'next/server';
import { loadTournament, removeTournament } from '@/lib/tournament/store';
import { buildView } from '@/lib/tournament/view';
import { getActor, managerLoginAvailable } from '@/lib/tournament/auth';
import { badRequest, errorResponse, noStore, parseGame, parseYear } from '@/lib/tournament/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ game: string }> };

/**
 * Public tournament view. Spectators poll this every few seconds with ?since=<version>;
 * when nothing changed they get a tiny { unchanged: true } back.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const game = parseGame((await params).game);
  const year = parseYear(req.nextUrl.searchParams.get('year'));
  if (!game || !year) return badRequest('Unknown tournament.');
  try {
    const s = await loadTournament(year, game);
    const actor = await getActor(year, game, s);
    const since = req.nextUrl.searchParams.get('since');
    const roleParam = req.nextUrl.searchParams.get('role');
    // Unchanged only if the caller's role is the same too (e.g. they just signed in as manager).
    if (s && since !== null && Number(since) === s.version && roleParam === actor.role) {
      return NextResponse.json({ unchanged: true, version: s.version }, { headers: noStore });
    }
    return NextResponse.json(
      { role: actor.role, managerLogin: managerLoginAvailable(), view: s ? buildView(s, actor.role) : null },
      { headers: noStore }
    );
  } catch (err) {
    return errorResponse(err, 'GET /api/tournaments/[game]');
  }
}

/** Admin: delete a draft or cancelled tournament (e.g. a practice run). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const game = parseGame((await params).game);
  const year = parseYear(req.nextUrl.searchParams.get('year'));
  if (!game || !year) return badRequest('Unknown tournament.');
  try {
    const actor = await getActor(year, game, null);
    if (actor.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
    return NextResponse.json({ ok: await removeTournament(year, game) }, { headers: noStore });
  } catch (err) {
    return errorResponse(err, 'DELETE /api/tournaments/[game]');
  }
}
