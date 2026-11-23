import { shuffle } from './teams';
import type { BracketPlan, Gender, Match, Rng, SlotSource, Team, WildcardSlot } from './types';

/**
 * Bracket planning.
 *
 * Field = regular teams + wildcard placeholders. Bracket size = next power of two;
 * the gap is filled with byes, spread evenly across round 1 (never two byes in one game).
 *
 * Wildcard placeholders become real teams during play: the waiting extra + the first
 * eliminated player of the other gender. So a wildcard's first game must come after
 * enough games have finished to free up that player. The planner tries, in order:
 *   1. every wildcard plays a round-1 game against a regular team, scheduled after the
 *      regular-vs-regular round-1 games;
 *   2. move wildcards (one at a time) onto round-1 byes, so they first play in round 2,
 *      after round 1 and any round-2 games that don't involve a wildcard.
 * Each candidate layout is simulated in play order assuming the worst case (a game that
 * might involve a wildcard frees nobody). If no layout works, planning fails and the
 * setup screen offers to make the extras alternates instead.
 */

export const nextPow2 = (n: number) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

export const roundLabel = (round: number, rounds: number) => {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${round}`;
};

/** Evenly spread `count` picks across `items` (deterministic). */
function spread<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(items[Math.floor((i * items.length) / count)]);
  return out;
}

type R1Slot = { kind: 'team' } | { kind: 'bye' } | { kind: 'wild'; index: number };

interface Layout {
  size: number;
  rounds: number;
  r1: [R1Slot, R1Slot][];
}

/** Round-1 bye positions: evenly spread game indices. */
function byeGames(half: number, byes: number): number[] {
  return spread(
    Array.from({ length: half }, (_, i) => i),
    byes
  );
}

interface Sim {
  ok: boolean;
  /** Play order per match id. */
  order: Map<string, number>;
  reason?: string;
}

const matchId = (round: number, position: number) => `r${round}m${position}`;

/** Simulates a layout in play order, worst case, and returns whether every wildcard can be filled in time. */
export function simulate(layout: Layout, neededGender: Gender[]): Sim {
  const { rounds, r1 } = layout;
  // hasWild[round][pos]: this game (or anything feeding it) involves a wildcard.
  const hasWild: boolean[][] = [];
  const played: boolean[][] = []; // false for round-1 bye games (not played)
  hasWild[1] = r1.map(([a, b]) => a.kind === 'wild' || b.kind === 'wild');
  played[1] = r1.map(([a, b]) => a.kind !== 'bye' && b.kind !== 'bye');
  for (let r = 2; r <= rounds; r++) {
    const n = layout.size >> r;
    hasWild[r] = Array.from({ length: n }, (_, p) => hasWild[r - 1][2 * p] || hasWild[r - 1][2 * p + 1]);
    played[r] = Array.from({ length: n }, () => true);
  }

  // Where each wildcard first plays: its round-1 game, or (on a bye) the round-2 game it feeds.
  const needAt = new Map<string, number[]>();
  r1.forEach(([a, b], p) => {
    for (const s of [a, b]) {
      if (s.kind !== 'wild') continue;
      const id = played[1][p] ? matchId(1, p) : matchId(2, p >> 1);
      needAt.set(id, [...(needAt.get(id) ?? []), s.index]);
    }
  });

  // Play order: by round; within a round, wildcard-free games first.
  const order = new Map<string, number>();
  const seq: { id: string; r: number; p: number }[] = [];
  for (let r = 1; r <= rounds; r++) {
    const idx = hasWild[r].map((_, p) => p);
    idx.sort((x, y) => Number(hasWild[r][x]) - Number(hasWild[r][y]) || x - y);
    for (const p of idx) if (played[r][p]) seq.push({ id: matchId(r, p), r, p });
  }
  seq.forEach((m, i) => order.set(m.id, i + 1));

  const supply: Record<Gender, number> = { M: 0, F: 0 };
  const demand: Record<Gender, number> = { M: 0, F: 0 };
  for (const m of seq) {
    for (const w of needAt.get(m.id) ?? []) {
      const g = neededGender[w];
      demand[g]++;
      if (demand[g] > supply[g]) {
        return { ok: false, order, reason: `Wildcard ${w + 1} would be needed before enough games have been played.` };
      }
    }
    if (!hasWild[m.r][m.p]) {
      supply.M++;
      supply.F++;
    }
  }
  return { ok: true, order };
}

/** Finds a workable layout for `teamCount` regular teams and the given wildcards, or explains why not. */
export function findLayout(
  teamCount: number,
  neededGender: Gender[]
): { ok: true; layout: Layout; order: Map<string, number> } | { ok: false; reason: string } {
  const W = neededGender.length;
  const field = teamCount + W;
  if (field < 2) return { ok: false, reason: 'You need at least two teams to make a bracket.' };
  const size = nextPow2(field);
  const rounds = Math.log2(size);
  const half = size / 2;
  const byes = size - field;
  const byeSet = new Set(byeGames(half, byes));
  const playedGames = Array.from({ length: half }, (_, i) => i).filter((i) => !byeSet.has(i));
  const byeList = [...byeSet];

  let lastReason = 'The wildcards could not be fitted into the bracket.';
  for (let k = Math.min(W, playedGames.length); k >= 0; k--) {
    const onByes = W - k;
    if (onByes > byeList.length) continue;
    const r1: [R1Slot, R1Slot][] = Array.from({ length: half }, (_, i) =>
      byeSet.has(i) ? [{ kind: 'team' }, { kind: 'bye' }] : [{ kind: 'team' }, { kind: 'team' }]
    );
    const wildGames = new Set<number>();
    // k wildcards in played round-1 games (spread out, so they don't meet each other early).
    spread(playedGames, k).forEach((g, j) => {
      r1[g] = [{ kind: 'wild', index: j }, { kind: 'team' }];
      wildGames.add(g);
    });
    // The rest on byes, preferring byes whose round-2 neighbour has no wildcard.
    const sibling = (g: number) => g ^ 1;
    const prefer = [...byeList].sort(
      (x, y) => Number(wildGames.has(sibling(x))) - Number(wildGames.has(sibling(y))) || x - y
    );
    const picked: number[] = [];
    for (const g of prefer) {
      if (picked.length === onByes) break;
      if (!picked.includes(sibling(g)) && !wildGames.has(sibling(g))) picked.push(g);
    }
    for (const g of prefer) {
      if (picked.length === onByes) break;
      if (!picked.includes(g)) picked.push(g);
    }
    picked.forEach((g, j) => {
      r1[g] = [{ kind: 'wild', index: k + j }, { kind: 'bye' }];
      wildGames.add(g);
    });
    const layout: Layout = { size, rounds, r1 };
    const sim = simulate(layout, neededGender);
    if (sim.ok) return { ok: true, layout, order: sim.order };
    lastReason = sim.reason ?? lastReason;
  }
  return { ok: false, reason: lastReason };
}

/** Builds the bracket: random team positions on a workable layout. */
export function planBracket(
  teams: readonly Team[],
  wildcards: readonly WildcardSlot[],
  rng: Rng,
  now: string
): { ok: true; plan: BracketPlan } | { ok: false; reason: string } {
  const found = findLayout(
    teams.length,
    wildcards.map((w) => w.neededGender)
  );
  if (!found.ok) return found;
  const { layout, order } = found;
  // Randomize which team lands where (never the imported/sign-up order).
  const pool = shuffle(teams, rng);
  // Randomize which bye/game slot side a team sits on, too, so "slot a" isn't special.
  const source = (s: R1Slot): SlotSource => {
    if (s.kind === 'bye') return { type: 'bye' };
    if (s.kind === 'wild') return { type: 'wildcard', wildcardId: wildcards[s.index].id };
    const t = pool.shift();
    if (!t) throw new Error('plan: ran out of teams');
    return { type: 'team', teamId: t.id };
  };

  const matches: Match[] = [];
  const rounds = layout.rounds;
  layout.r1.forEach(([x, y], p) => {
    const [sa, sb] = rng(2) === 0 ? [x, y] : [y, x];
    const a = source(sa);
    const b = source(sb);
    matches.push(blankMatch(1, p, rounds, a, b, order.get(matchId(1, p)) ?? 0));
  });
  for (let r = 2; r <= rounds; r++) {
    const n = layout.size >> r;
    for (let p = 0; p < n; p++) {
      matches.push(
        blankMatch(
          r,
          p,
          rounds,
          { type: 'match', matchId: matchId(r - 1, 2 * p) },
          { type: 'match', matchId: matchId(r - 1, 2 * p + 1) },
          order.get(matchId(r, p)) ?? 0
        )
      );
    }
  }
  return { ok: true, plan: { size: layout.size, rounds, matches, wildcards: wildcards.map((w) => ({ ...w })), createdAt: now } };
}

function blankMatch(round: number, position: number, rounds: number, a: SlotSource, b: SlotSource, order: number): Match {
  return {
    id: matchId(round, position),
    round,
    position,
    a: { source: a, teamId: a.type === 'team' ? a.teamId : undefined },
    b: { source: b, teamId: b.type === 'team' ? b.teamId : undefined },
    status: 'pending',
    next: round < rounds ? { matchId: matchId(round + 1, position >> 1), slot: position % 2 === 0 ? 'a' : 'b' } : undefined,
    order,
    version: 0,
    history: [],
  };
}
