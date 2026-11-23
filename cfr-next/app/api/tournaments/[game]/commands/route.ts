import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runCommand, loadTournament } from '@/lib/tournament/store';
import { buildView } from '@/lib/tournament/view';
import { getActor, hashPassword } from '@/lib/tournament/auth';
import { can, type Command } from '@/lib/tournament/engine';
import { badRequest, errorResponse, noStore, parseGame, parseYear } from '@/lib/tournament/api';
import { getActivitySignups, listFamilyMemberRecords } from '@/lib/reunion-db';
import { GENDER_IDS } from '@/lib/reunion-config';
import { MAX_LANES } from '@/lib/tournament/types';

export const dynamic = 'force-dynamic';

const id = z.string().trim().min(1).max(100);
const score = z.number().int().min(0).max(999);
const gender = z.enum(GENDER_IDS);

// What the browser may send. Server fills in anything it must not trust (sign-ups, names, password hash).
const clientCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('importSignups') }),
  z.object({ type: z.literal('addParticipant'), personId: id, gender }),
  z.object({ type: z.literal('updateParticipant'), personId: id, gender: gender.optional(), excluded: z.boolean().optional() }),
  z.object({ type: z.literal('removeParticipant'), personId: id }),
  z.object({ type: z.literal('generateTeams') }),
  z.object({ type: z.literal('swapPlayers'), personA: id, personB: id }),
  z.object({ type: z.literal('setExtrasAsAlternates'), value: z.boolean() }),
  z.object({ type: z.literal('makePlan') }),
  z.object({ type: z.literal('setTargetScore'), targetScore: z.number().int().min(1).max(999) }),
  z.object({ type: z.literal('setManagerPassword'), password: z.string().min(4, 'Use at least 4 characters.').max(100) }),
  z.object({ type: z.literal('publish') }),
  z.object({ type: z.literal('unpublish') }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('complete') }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('reopen') }),
  z.object({ type: z.literal('startMatch'), matchId: id, lane: z.number().int().min(1).max(MAX_LANES).optional() }),
  z.object({ type: z.literal('setLanes'), lanes: z.number().int().min(1).max(MAX_LANES) }),
  z.object({ type: z.literal('saveScore'), matchId: id, scoreA: score, scoreB: score }),
  z.object({ type: z.literal('completeMatch'), matchId: id, scoreA: score, scoreB: score }),
  z.object({ type: z.literal('correctMatch'), matchId: id, scoreA: score, scoreB: score, rollback: z.boolean().optional() }),
  z.object({ type: z.literal('fillWildcard'), wildcardId: id, personId: id }),
  z.object({ type: z.literal('declineWildcard'), wildcardId: id, personId: id }),
  z.object({ type: z.literal('substitute'), teamId: id, outPersonId: id, inPersonId: id }),
  // From the family list (personId), or a guest who isn't in it (name).
  z.object({ type: z.literal('lateAdd'), personId: id.optional(), name: z.string().trim().min(1).max(60).optional(), gender }),
]);

const body = z.object({
  year: z.string(),
  command: clientCommand,
  /** For game commands: the version of the game the client was looking at. */
  expectedMatchVersion: z.number().int().min(0).optional(),
});

type Params = { params: Promise<{ game: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const game = parseGame((await params).game);
  if (!game) return badRequest('Unknown tournament.');
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest('Invalid request.');
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request.');
  const year = parseYear(parsed.data.year);
  if (!year) return badRequest('Invalid year.');
  const c = parsed.data.command;

  try {
    const current = await loadTournament(year, game);
    const actor = await getActor(year, game, current);
    // Check permission before doing any server-side lookups.
    if (!can(actor, c.type)) {
      return NextResponse.json({ error: 'You do not have permission to do that.', code: 'forbidden' }, { status: 403, headers: noStore });
    }

    let cmd: Command;
    switch (c.type) {
      case 'importSignups':
        cmd = { type: 'importSignups', signups: await getActivitySignups(year, game) };
        break;
      case 'addParticipant': {
        const m = (await listFamilyMemberRecords()).find((x) => x.personId === c.personId);
        if (!m) return badRequest('That person was not found in the family list.');
        cmd = { type: 'addParticipant', personId: m.personId, name: m.displayName, gender: c.gender };
        break;
      }
      case 'lateAdd': {
        if (c.personId) {
          const m = (await listFamilyMemberRecords()).find((x) => x.personId === c.personId);
          if (!m) return badRequest('That person was not found in the family list.');
          cmd = { type: 'lateAdd', personId: m.personId, name: m.displayName, gender: c.gender };
        } else if (c.name) {
          cmd = { type: 'lateAdd', personId: `guest-${randomUUID().slice(0, 8)}`, name: c.name, gender: c.gender };
        } else return badRequest('Pick someone from the family list or type their name.');
        break;
      }
      case 'setManagerPassword':
        cmd = { type: 'setManagerPassword', hash: hashPassword(c.password) };
        break;
      default:
        cmd = c;
    }

    const matchId = 'matchId' in c ? c.matchId : undefined;
    const { state } = await runCommand(year, game, actor, cmd, {
      createIfMissing: actor.role === 'admin',
      matchId,
      expectedMatchVersion: parsed.data.expectedMatchVersion,
    });
    return NextResponse.json({ ok: true, role: actor.role, view: buildView(state, actor.role) }, { headers: noStore });
  } catch (err) {
    return errorResponse(err, `POST /api/tournaments/${game}/commands`);
  }
}
