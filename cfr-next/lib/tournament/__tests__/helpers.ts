import { apply, newTournament, wildcardCandidates, type Command } from '../engine';
import type { Actor, Gender, Rng, TournamentState } from '../types';

export const admin: Actor = { role: 'admin', id: 'admin@test' };
export const manager: Actor = { role: 'manager', id: 'manager' };
export const spectator: Actor = { role: 'spectator', id: 'anon' };

/** Seeded PRNG (mulberry32) so tests are repeatable. */
export function seeded(seed = 42): Rng {
  let a = seed >>> 0;
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

let clock = 0;
export const ctx = (rng = seeded()) => ({ now: new Date(Date.UTC(2026, 6, 4, 12, 0, clock++)).toISOString(), rng });

export function run(s: TournamentState, cmd: Command, actor: Actor = admin, rng?: Rng) {
  return apply(s, cmd, actor, ctx(rng)).state;
}

export function people(men: number, women: number, extra: { gender?: Gender; name: string }[] = []) {
  const out: { personId: string; name: string; gender?: Gender }[] = [];
  for (let i = 1; i <= men; i++) out.push({ personId: `m${i}`, name: `Man ${i} Churchwell`, gender: 'M' });
  for (let i = 1; i <= women; i++) out.push({ personId: `f${i}`, name: `Woman ${i} Churchwell`, gender: 'F' });
  extra.forEach((e, i) => out.push({ personId: `x${i + 1}`, name: e.name, gender: e.gender }));
  return out;
}

/** Import, make teams, preview and publish; optionally start. */
export function setup(men: number, women: number, opts: { start?: boolean; seed?: number; game?: 'cornhole' | 'horseshoes' } = {}) {
  const rng = seeded(opts.seed ?? 7);
  let s = newTournament('2099', opts.game ?? 'cornhole', ctx().now);
  s = run(s, { type: 'importSignups', signups: people(men, women) }, admin, rng);
  s = run(s, { type: 'generateTeams' }, admin, rng);
  s = run(s, { type: 'makePlan' }, admin, rng);
  s = run(s, { type: 'publish' }, admin, rng);
  if (opts.start !== false) s = run(s, { type: 'start' }, manager, rng);
  return s;
}

/** Next game that can be played, in suggested order. */
export const nextReady = (s: TournamentState) =>
  [...s.matches].filter((m) => m.status === 'ready').sort((a, b) => a.order - b.order)[0];

/** Fills any wildcard whose game is waiting, using the first suggested candidate. */
export function fillWildcards(s: TournamentState) {
  for (const w of s.wildcards) {
    if (w.teamId) continue;
    const c = wildcardCandidates(s, w)[0];
    if (c) s = run(s, { type: 'fillWildcard', wildcardId: w.id, personId: c.personId }, manager);
  }
  return s;
}

/** Plays the whole tournament: slot "a" wins every game 21–15. */
export function playOut(s: TournamentState, limit = 200) {
  for (let i = 0; i < limit && s.status === 'IN_PROGRESS'; i++) {
    s = fillWildcards(s);
    const m = nextReady(s);
    if (!m) break;
    s = run(s, { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 15 }, manager);
  }
  return s;
}

export const played = (s: TournamentState) => s.matches.filter((m) => m.status !== 'bye');
export const byes = (s: TournamentState) => s.matches.filter((m) => m.status === 'bye');
