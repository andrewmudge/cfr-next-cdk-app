import { describe, expect, it } from 'vitest';
import { apply, activeTeamIds, newTournament, reenteredIds, wildcardCandidates } from '../engine';
import { findLayout } from '../plan';
import { buildView } from '../view';
import { TournamentError } from '../types';
import { admin, byes, ctx, manager, nextReady, people, playOut, played, run, seeded, setup, spectator, fillWildcards } from './helpers';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as TournamentError;
  }
  throw new Error('expected an error');
};

/** Every person is on at most one active team, and every team is one man + one woman. */
function checkTeams(s: ReturnType<typeof setup>) {
  const active = activeTeamIds(s);
  const seen = new Set<string>();
  for (const t of s.teams) {
    expect(s.participants.find((p) => p.personId === t.maleId)?.gender).toBe('M');
    expect(s.participants.find((p) => p.personId === t.femaleId)?.gender).toBe('F');
    if (!active.has(t.id)) continue;
    for (const p of [t.maleId, t.femaleId]) {
      expect(seen.has(p)).toBe(false);
      seen.add(p);
    }
  }
}

describe('brackets', () => {
  it('1. eight teams: normal three-round single elimination', () => {
    let s = setup(8, 8);
    expect(s.matches).toHaveLength(7);
    expect(byes(s)).toHaveLength(0);
    expect(Math.max(...s.matches.map((m) => m.round))).toBe(3);
    expect(s.matches.filter((m) => m.round === 1).every((m) => m.status === 'ready')).toBe(true);
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');
    expect(played(s).every((m) => m.status === 'done')).toBe(true);
    checkTeams(s);
  });

  it('2. six teams: two byes, bye teams move on without a played game', () => {
    let s = setup(6, 6);
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(byes(s)).toHaveLength(2);
    for (const b of byes(s)) {
      expect(b.winnerTeamId).toBeDefined();
      expect(b.scoreA).toBeUndefined(); // no fictional scores
      const next = s.matches.find((m) => m.id === b.next!.matchId)!;
      expect(next[b.next!.slot].teamId).toBe(b.winnerTeamId);
    }
    // Byes are spread out: never two byes feeding the same round-2 game.
    const r2 = s.matches.filter((m) => m.round === 2);
    expect(r2.every((m) => m.status !== 'ready')).toBe(true);
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');
    expect(played(s)).toHaveLength(5);
  });

  it('3. ten teams: sixteen-slot bracket with six byes', () => {
    let s = setup(10, 10);
    expect(s.matches.filter((m) => m.round === 1)).toHaveLength(8);
    expect(byes(s)).toHaveLength(6);
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');
    expect(played(s)).toHaveLength(9);
    checkTeams(s);
  });

  it('team positions are random, not the sign-up order', () => {
    const a = setup(8, 8, { seed: 1 }).matches.filter((m) => m.round === 1).map((m) => m.a.teamId);
    const b = setup(8, 8, { seed: 99 }).matches.filter((m) => m.round === 1).map((m) => m.a.teamId);
    expect(a).not.toEqual(b);
  });
});

describe('wildcards', () => {
  it('4. one extra man waits; the first woman to lose re-enters with him', () => {
    let s = setup(9, 8);
    expect(s.teams).toHaveLength(8);
    expect(s.extras).toEqual([expect.stringMatching(/^m/)]);
    expect(s.wildcards).toHaveLength(1);
    expect(s.wildcards[0].neededGender).toBe('F');
    // 9 entries in a 16 bracket: one round-1 game, so the wildcard sits on a bye and first plays in round 2.
    const wSlot = s.matches.find((m) => m.a.source.type === 'wildcard' || m.b.source.type === 'wildcard')!;
    const wGame = wSlot.status === 'bye' ? s.matches.find((m) => m.id === wSlot.next!.matchId)! : wSlot;
    // Its game can't start before the wildcard teammate is picked.
    expect(err(() => run(s, { type: 'startMatch', matchId: wGame.id }, manager)).message).toMatch(/wildcard/i);
    expect(wildcardCandidates(s, s.wildcards[0])).toHaveLength(0);

    // First regular game finishes: its losing woman is the first suggestion.
    const first = nextReady(s);
    s = run(s, { type: 'completeMatch', matchId: first.id, scoreA: 21, scoreB: 10 }, manager);
    const loser = s.teams.find((t) => t.id === s.matches.find((m) => m.id === first.id)!.loserTeamId)!;
    expect(wildcardCandidates(s, s.wildcards[0])[0]).toEqual({ personId: loser.femaleId, why: 'loser' });
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');
    expect(reenteredIds(s).has(loser.femaleId)).toBe(true);
    checkTeams(s);
  });

  it('5. one extra woman: the first man to lose re-enters', () => {
    let s = setup(8, 9);
    expect(s.wildcards[0].neededGender).toBe('M');
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');
    const w = s.wildcards[0];
    const t = s.teams.find((x) => x.id === w.teamId)!;
    expect(t.femaleId).toBe(w.waitingPersonId);
    expect(reenteredIds(s).has(t.maleId)).toBe(true);
  });

  it('6. 10 men + 7 women: the first three women to lose each re-enter (some enter in round 2)', () => {
    const found = findLayout(7, ['F', 'F', 'F']);
    expect(found.ok).toBe(true);
    let s = setup(10, 7);
    expect(s.wildcards).toHaveLength(3);
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');
    expect(s.wildcards.every((w) => w.teamId)).toBe(true);
    // The re-entered women are the losers of the first three games that freed a woman, in order.
    const re = reenteredIds(s);
    expect(re.size).toBe(3);
    for (const id of re) expect(id.startsWith('f')).toBe(true);
    checkTeams(s);
  });

  it('7. first loser declines: manager picks the next eligible player', () => {
    let s = setup(9, 8);
    s = run(s, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 3 }, manager);
    s = run(s, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 3 }, manager);
    const w = s.wildcards[0];
    const [first, second] = wildcardCandidates(s, w);
    s = run(s, { type: 'declineWildcard', wildcardId: w.id, personId: first.personId }, manager);
    expect(wildcardCandidates(s, s.wildcards[0])[0].personId).toBe(second.personId);
    // The person who declined can't be forced in.
    expect(err(() => run(s, { type: 'fillWildcard', wildcardId: w.id, personId: first.personId }, manager)).message).toMatch(/can't take/);
    s = run(s, { type: 'fillWildcard', wildcardId: w.id, personId: second.personId }, manager);
    expect(s.teams.find((t) => t.id === s.wildcards[0].teamId)!.femaleId).toBe(second.personId);
  });

  it('8. no eligible wildcard player yet: slot stays open and its game cannot start', () => {
    const s = setup(9, 8);
    const w = s.wildcards[0];
    expect(wildcardCandidates(s, w)).toEqual([]);
    expect(err(() => run(s, { type: 'fillWildcard', wildcardId: w.id, personId: 'f1' }, manager)).message).toMatch(/can't take/);
  });

  it('9. wildcards that cannot fit: as many as fit are kept, the rest become alternates', () => {
    let s = newTournament('2099', 'cornhole', ctx().now);
    s = run(s, { type: 'importSignups', signups: people(7, 4) });
    s = run(s, { type: 'generateTeams' });
    // 4 teams + 3 wildcards: only two games are played before round 2, so only 2 wildcards fit.
    expect(findLayout(4, ['F', 'F', 'F']).ok).toBe(false);
    s = run(s, { type: 'makePlan' });
    expect(s.plan!.wildcards).toHaveLength(2);
    s = run(s, { type: 'publish' });
    s = run(s, { type: 'start' }, manager);
    const alternate = s.extras.find((x) => !s.wildcards.some((w) => w.waitingPersonId === x))!;
    expect(alternate).toBeDefined();
    s = playOut(s);
    expect(s.status).toBe('COMPLETED');

    // One team and nothing else: impossible, and says why.
    let t = newTournament('2099', 'cornhole', ctx().now);
    t = run(t, { type: 'importSignups', signups: people(1, 3) });
    t = run(t, { type: 'generateTeams' });
    expect(err(() => run(t, { type: 'makePlan' })).message).toMatch(/at least two teams/);
    // Small field with one wildcard is fine: it goes on the bye and enters in the final.
    expect(findLayout(2, ['F']).ok).toBe(true);
    expect(findLayout(1, ['F']).ok).toBe(false);
  });

  it('10. a player already on an active team cannot fill a wildcard', () => {
    let s = setup(9, 8);
    s = run(s, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 3 }, manager);
    const activeWoman = s.teams.find((t) => activeTeamIds(s).has(t.id))!.femaleId;
    expect(err(() => run(s, { type: 'fillWildcard', wildcardId: 'W1', personId: activeWoman }, manager)).message).toMatch(/can't take/);
  });
});

describe('scoring', () => {
  it('12. finishing the same game twice is harmless; a different second result is refused', () => {
    let s = setup(8, 8);
    const m = nextReady(s);
    s = run(s, { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 12 }, manager);
    const again = apply(s, { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 12 }, manager, ctx());
    expect(again.changed).toBe(false);
    expect(again.state).toBe(s);
    const e = err(() => run(s, { type: 'completeMatch', matchId: m.id, scoreA: 12, scoreB: 21 }, manager));
    expect(e.code).toBe('conflict');
  });

  it('13. fixing a result after the winner moved on', () => {
    let s = setup(8, 8);
    const m = s.matches.find((x) => x.id === 'r1m0')!;
    s = run(s, { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 12 }, manager);
    const oldWinner = s.matches.find((x) => x.id === 'r1m0')!.winnerTeamId!;
    const newWinner = s.matches.find((x) => x.id === 'r1m0')!.loserTeamId!;
    // Next game not started yet: a manager can fix it and the right team moves on.
    s = run(s, { type: 'correctMatch', matchId: m.id, scoreA: 10, scoreB: 21 }, manager);
    expect(s.matches.find((x) => x.id === 'r2m0')!.a.teamId).toBe(newWinner);

    // Now play the next game; fixing round 1 again needs an admin rollback.
    s = run(s, { type: 'completeMatch', matchId: 'r1m1', scoreA: 21, scoreB: 5 }, manager);
    s = run(s, { type: 'completeMatch', matchId: 'r2m0', scoreA: 21, scoreB: 5 }, manager);
    let e = err(() => run(s, { type: 'correctMatch', matchId: 'r1m0', scoreA: 21, scoreB: 10 }, manager));
    expect(e.code).toBe('conflict');
    e = err(() => run(s, { type: 'correctMatch', matchId: 'r1m0', scoreA: 21, scoreB: 10, rollback: true }, manager));
    expect(e.code).toBe('forbidden');
    s = run(s, { type: 'correctMatch', matchId: 'r1m0', scoreA: 21, scoreB: 10, rollback: true }, admin);
    const r2 = s.matches.find((x) => x.id === 'r2m0')!;
    expect(r2.status).toBe('ready'); // rolled back, to be replayed
    expect(r2.scoreA).toBeUndefined();
    expect(r2.a.teamId).toBe(oldWinner);
    expect(s.matches.find((x) => x.id === 'r3m0')!.a.teamId).toBeUndefined();
  });

  it('14. a tied final score is refused', () => {
    const s = setup(8, 8);
    expect(err(() => run(s, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 21 }, manager)).message).toMatch(/tie/);
  });

  it('reaching the target score does not end a game by itself', () => {
    let s = setup(8, 8);
    const m = nextReady(s);
    s = run(s, { type: 'startMatch', matchId: m.id }, manager);
    s = run(s, { type: 'saveScore', matchId: m.id, scoreA: 23, scoreB: 4 }, manager);
    expect(s.matches.find((x) => x.id === m.id)!.status).toBe('live');
  });

  it('paused tournaments refuse scores', () => {
    let s = setup(8, 8);
    s = run(s, { type: 'pause' }, manager);
    expect(err(() => run(s, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 1 }, manager)).message).toMatch(/paused/);
  });
});

describe('participants', () => {
  it('15. the same person can play in both tournaments', () => {
    const c = setup(4, 4, { game: 'cornhole' });
    const h = setup(4, 4, { game: 'horseshoes' });
    expect(c.participants.map((p) => p.personId).sort()).toEqual(h.participants.map((p) => p.personId).sort());
    expect(c.id).not.toBe(h.id);
    checkTeams(c);
    checkTeams(h);
  });

  it('16. missing gender: flagged for review, never paired', () => {
    let s = newTournament('2099', 'cornhole', ctx().now);
    s = run(s, { type: 'importSignups', signups: people(4, 4, [{ name: 'Sam Churchwell' }]) });
    s = run(s, { type: 'generateTeams' });
    expect(s.teams).toHaveLength(4);
    expect(s.teams.some((t) => t.maleId === 'x1' || t.femaleId === 'x1')).toBe(false);
    expect(s.extras).not.toContain('x1');
    const v = buildView(s, 'admin');
    expect(v.counts.needsReview).toBe(1);
    expect(v.setup!.participants.find((p) => p.personId === 'x1')!.state).toBe('needs_review');
    s = run(s, { type: 'updateParticipant', personId: 'x1', gender: 'M' });
    expect(buildView(s, 'admin').counts.needsReview).toBe(0);
  });

  it('teams are locked once published', () => {
    const s = setup(4, 4, { start: false });
    expect(err(() => run(s, { type: 'generateTeams' })).message).toMatch(/locked/);
  });

  it('substitution keeps teams mixed and refuses busy players', () => {
    let s = newTournament('2099', 'cornhole', ctx().now);
    s = run(s, { type: 'importSignups', signups: people(5, 4) });
    s = run(s, { type: 'setExtrasAsAlternates', value: true });
    s = run(s, { type: 'generateTeams' });
    s = run(s, { type: 'makePlan' });
    s = run(s, { type: 'publish' });
    const alt = s.extras[0];
    const team = s.teams[0];
    expect(err(() => run(s, { type: 'substitute', teamId: team.id, outPersonId: team.femaleId, inPersonId: alt }, manager)).message).toMatch(/mixed/);
    expect(err(() => run(s, { type: 'substitute', teamId: team.id, outPersonId: team.maleId, inPersonId: s.teams[1].maleId }, manager)).message).toMatch(/already on a team/);
    s = run(s, { type: 'substitute', teamId: team.id, outPersonId: team.maleId, inPersonId: alt }, manager);
    expect(s.teams[0].maleId).toBe(alt);
  });
});

describe('lifecycle and permissions', () => {
  it('17. final decides the champion and completes the tournament', () => {
    const s = playOut(setup(4, 4));
    const final = s.matches.find((m) => !m.next)!;
    expect(s.status).toBe('COMPLETED');
    expect(s.championTeamId).toBe(final.winnerTeamId);
    expect(buildView(s, 'spectator').champion?.id).toBe(final.winnerTeamId);
    expect(buildView(s, 'spectator').teams.find((t) => t.id === final.winnerTeamId)!.status).toBe('champion');
  });

  it('18. reopening a finished tournament needs an admin', () => {
    let s = playOut(setup(4, 4));
    expect(err(() => run(s, { type: 'reopen' }, manager)).code).toBe('forbidden');
    s = run(s, { type: 'reopen' }, admin);
    expect(s.status).toBe('IN_PROGRESS');
    // Managers can't change results of a finished tournament.
    const done = playOut(setup(4, 4));
    expect(err(() => run(done, { type: 'correctMatch', matchId: 'r1m0', scoreA: 0, scoreB: 21 }, manager)).code).toBe('forbidden');
  });

  it('19. spectators and managers cannot do what they are not allowed to', () => {
    const s = setup(4, 4);
    expect(err(() => run(s, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 1 }, spectator)).code).toBe('forbidden');
    expect(err(() => run(s, { type: 'cancel' }, manager)).code).toBe('forbidden');
    expect(err(() => run(s, { type: 'setManagerPassword', hash: 'x' }, manager)).code).toBe('forbidden');
  });

  it('spectators never see the password hash or setup data', () => {
    let s = setup(4, 4);
    s = run(s, { type: 'setManagerPassword', hash: 'scrypt$secret' });
    const v = buildView(s, 'spectator');
    expect(JSON.stringify(v)).not.toContain('scrypt$secret');
    expect(v.setup).toBeUndefined();
    expect(v.hasManagerPassword).toBe(true);
  });

  it('drafts are hidden from spectators', () => {
    let s = newTournament('2099', 'cornhole', ctx().now);
    s = run(s, { type: 'importSignups', signups: people(4, 4) });
    s = run(s, { type: 'generateTeams' });
    expect(buildView(s, 'spectator').teams).toEqual([]);
  });
});

describe('lanes (boards / pits)', () => {
  it('horseshoes has 2 pits: two games at once, a third waits for a free pit', () => {
    let s = setup(8, 8, { game: 'horseshoes' });
    expect(buildView(s, 'spectator').lanes).toBe(2);
    expect(buildView(s, 'spectator').laneName).toBe('Pit');
    const ready = s.matches.filter((m) => m.status === 'ready').sort((a, b) => a.order - b.order);
    s = run(s, { type: 'startMatch', matchId: ready[0].id }, manager);
    s = run(s, { type: 'startMatch', matchId: ready[1].id }, manager);
    expect(s.matches.find((m) => m.id === ready[0].id)!.lane).toBe(1);
    expect(s.matches.find((m) => m.id === ready[1].id)!.lane).toBe(2);
    expect(err(() => run(s, { type: 'startMatch', matchId: ready[2].id }, manager)).message).toMatch(/All 2 pits are in use/);
    // Finishing a game frees its pit; the next game takes it.
    s = run(s, { type: 'completeMatch', matchId: ready[0].id, scoreA: 21, scoreB: 4 }, manager);
    s = run(s, { type: 'startMatch', matchId: ready[2].id }, manager);
    expect(s.matches.find((m) => m.id === ready[2].id)!.lane).toBe(1);
  });

  it('a game cannot go on a busy lane; a live game can move to a free one', () => {
    let s = setup(8, 8);
    s = run(s, { type: 'setLanes', lanes: 3 }, manager);
    const [a, b] = s.matches.filter((m) => m.status === 'ready');
    s = run(s, { type: 'startMatch', matchId: a.id, lane: 2 }, manager);
    expect(err(() => run(s, { type: 'startMatch', matchId: b.id, lane: 2 }, manager)).message).toMatch(/Board 2 is in use/);
    expect(err(() => run(s, { type: 'startMatch', matchId: b.id, lane: 4 }, manager)).message).toMatch(/no board 4/);
    s = run(s, { type: 'startMatch', matchId: a.id, lane: 3 }, manager);
    expect(s.matches.find((m) => m.id === a.id)!.lane).toBe(3);
  });

  it('cornhole boards: the manager can add or remove boards, but not one in use', () => {
    let s = setup(8, 8);
    s = run(s, { type: 'setLanes', lanes: 4 }, manager);
    const ready = s.matches.filter((m) => m.status === 'ready');
    s = run(s, { type: 'startMatch', matchId: ready[0].id, lane: 4 }, manager);
    expect(err(() => run(s, { type: 'setLanes', lanes: 3 }, manager)).message).toMatch(/board 4/);
    expect(err(() => run(s, { type: 'setLanes', lanes: 0 }, manager)).message).toMatch(/1 to/);
    expect(err(() => run(s, { type: 'setLanes', lanes: 2 }, spectator)).code).toBe('forbidden');
  });

  it('up next is one game per lane, even while every lane is busy; a manager can start a later game early', () => {
    let s = setup(16, 16, { game: 'horseshoes' }); // 8 first-round games, 2 pits
    const order = s.matches.filter((m) => m.status === 'ready').sort((a, b) => a.order - b.order).map((m) => m.id);
    let v = buildView(s, 'spectator');
    expect(v.upNext).toEqual(order.slice(0, 2));
    expect(v.onDeck).toEqual(order.slice(2));
    s = run(s, { type: 'startMatch', matchId: order[0] }, manager);
    s = run(s, { type: 'startMatch', matchId: order[1] }, manager);
    v = buildView(s, 'spectator');
    expect(v.laneBoard).toEqual([{ lane: 1, liveMatchId: order[0] }, { lane: 2, liveMatchId: order[1] }]);
    expect(v.upNext).toEqual(order.slice(2, 4));
    expect(v.onDeck).toEqual(order.slice(4));
    // Pit 1 frees up, but the first up-next team isn't here: the manager starts a later game instead.
    s = run(s, { type: 'completeMatch', matchId: order[0], scoreA: 21, scoreB: 5 }, manager);
    s = run(s, { type: 'startMatch', matchId: order[5] }, manager);
    v = buildView(s, 'spectator');
    expect(v.laneBoard[0]).toEqual({ lane: 1, liveMatchId: order[5] });
    expect(v.upNext).toEqual(order.slice(2, 4)); // the skipped game keeps its place at the front
    expect(v.onDeck).toEqual([order[4], order[6], order[7]]);
  });

  it('putting the first game on a lane starts a published tournament', () => {
    let s = setup(4, 4, { start: false });
    expect(s.status).toBe('READY');
    s = run(s, { type: 'startMatch', matchId: 'r1m0', lane: 1 }, manager);
    expect(s.status).toBe('IN_PROGRESS');
    expect(s.startedAt).toBeTruthy();
    expect(s.matches.find((m) => m.id === 'r1m0')!.status).toBe('live');
  });

  it('rolling back a live game frees its lane', () => {
    let s = setup(4, 4);
    s = run(s, { type: 'completeMatch', matchId: 'r1m0', scoreA: 21, scoreB: 3 }, manager);
    s = run(s, { type: 'completeMatch', matchId: 'r1m1', scoreA: 21, scoreB: 3 }, manager);
    s = run(s, { type: 'startMatch', matchId: 'r2m0' }, manager);
    s = run(s, { type: 'correctMatch', matchId: 'r1m0', scoreA: 3, scoreB: 21, rollback: true }, admin);
    const final = s.matches.find((m) => m.id === 'r2m0')!;
    expect(final.status).toBe('ready');
    expect(final.lane).toBeUndefined();
  });
});

describe('large tournaments', () => {
  it('40+ teams: 64-spot bracket plays out, and the stored item stays far under the 400 KB limit', () => {
    for (const [men, women, teams, wild] of [
      [40, 40, 40, 0],
      [45, 40, 45, 5],
      [40, 48, 48, 8],
    ]) {
      const rng = seeded(men + women);
      let s = newTournament('2099', 'cornhole', ctx().now);
      const signups = [
        ...Array.from({ length: men }, (_, i) => ({ personId: `ft_M${i}`, name: `Christopher Churchwell-${i}`, gender: 'M' as const })),
        ...Array.from({ length: women }, (_, i) => ({ personId: `ft_F${i}`, name: `Elizabeth Churchwell-${i}`, gender: 'F' as const })),
      ];
      s = run(s, { type: 'importSignups', signups }, admin, rng);
      s = run(s, { type: 'generateTeams' }, admin, rng);
      s = run(s, { type: 'makePlan' }, admin, rng);
      expect(s.plan!.size).toBe(64);
      expect(s.plan!.wildcards).toHaveLength(wild);
      s = run(s, { type: 'publish' }, admin, rng);
      s = run(s, { type: 'start' }, manager, rng);
      // Tap-by-tap games: ~35 autosaves each before the final score.
      for (let g = 0; g < 200 && s.status === 'IN_PROGRESS'; g++) {
        s = fillWildcards(s);
        const m = nextReady(s);
        if (!m) break;
        s = run(s, { type: 'startMatch', matchId: m.id }, manager);
        for (let k = 1; k <= 35; k++) s = run(s, { type: 'saveScore', matchId: m.id, scoreA: Math.ceil(k / 2), scoreB: Math.floor(k / 2) }, manager);
        s = run(s, { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 17 }, manager);
      }
      expect(s.status).toBe('COMPLETED');
      expect(s.teams).toHaveLength(teams);
      expect(s.matches.filter((m) => m.status === 'done')).toHaveLength(teams - 1);
      checkTeams(s);
      const kb = Buffer.byteLength(JSON.stringify(s)) / 1024;
      expect(kb).toBeLessThan(150); // DynamoDB item limit is 400 KB
    }
  }, 60_000);
});

describe('many random fields', () => {
  it('every size from 2 to 40 people with uneven genders plays out cleanly', () => {
    for (let men = 1; men <= 20; men++) {
      for (let women = 1; women <= 20; women++) {
        let s = newTournament('2099', 'cornhole', ctx().now);
        const rng = seeded(men * 100 + women);
        s = run(s, { type: 'importSignups', signups: people(men, women) }, admin, rng);
        s = run(s, { type: 'generateTeams' }, admin, rng);
        const r = (() => {
          try {
            return run(s, { type: 'makePlan' }, admin, rng);
          } catch {
            return null;
          }
        })();
        if (!r) {
          // Only a single team is impossible.
          expect(Math.min(men, women)).toBe(1);
          continue;
        }
        s = run(r, { type: 'publish' }, admin, rng);
        s = run(s, { type: 'start' }, manager, rng);
        s = playOut(fillWildcards(s));
        expect(s.status, `${men}M ${women}F`).toBe('COMPLETED');
        expect(s.wildcards.every((w) => w.teamId), `${men}M ${women}F wildcards`).toBe(true);
        // Everyone who could get a wildcard did, or sits out as an alternate.
        expect(s.wildcards.length).toBeLessThanOrEqual(Math.abs(men - women));
        checkTeams(s);
      }
    }
  });
});
