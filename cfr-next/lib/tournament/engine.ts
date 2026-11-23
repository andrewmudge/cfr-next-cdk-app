// The tournament engine: pure functions that apply one command to a TournamentState.
// Every rule lives here; the API only decides *who* may send which command.

import { generateTeams, isEligible } from './teams';
import { planBracket } from './plan';
import {
  GAMES,
  MAX_LANES,
  TournamentError,
  laneCount,
  type Actor,
  type GameId,
  type Gender,
  type Match,
  type Participant,
  type Role,
  type Rng,
  type Team,
  type TournamentEvent,
  type TournamentState,
  type WildcardSlot,
} from './types';

export type Command =
  // ---- Setup (admin, DRAFT only) ----
  | { type: 'importSignups'; signups: { personId: string; name: string; gender?: Gender }[] }
  | { type: 'addParticipant'; personId: string; name: string; gender: Gender }
  | { type: 'updateParticipant'; personId: string; gender?: Gender; excluded?: boolean }
  | { type: 'removeParticipant'; personId: string }
  | { type: 'generateTeams' }
  | { type: 'swapPlayers'; personA: string; personB: string }
  | { type: 'setExtrasAsAlternates'; value: boolean }
  | { type: 'makePlan' }
  | { type: 'setTargetScore'; targetScore: number }
  | { type: 'setLanes'; lanes: number }
  | { type: 'setManagerPassword'; hash: string }
  // ---- Lifecycle ----
  | { type: 'publish' }
  | { type: 'unpublish' }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'complete' }
  | { type: 'cancel' }
  | { type: 'reopen' }
  // ---- Play (managers) ----
  | { type: 'startMatch'; matchId: string; lane?: number }
  | { type: 'saveScore'; matchId: string; scoreA: number; scoreB: number }
  | { type: 'completeMatch'; matchId: string; scoreA: number; scoreB: number }
  | { type: 'correctMatch'; matchId: string; scoreA: number; scoreB: number; rollback?: boolean }
  | { type: 'fillWildcard'; wildcardId: string; personId: string }
  | { type: 'declineWildcard'; wildcardId: string; personId: string }
  | { type: 'substitute'; teamId: string; outPersonId: string; inPersonId: string }
  // Someone who missed sign-up, after publishing but before the first game starts.
  | { type: 'lateAdd'; personId: string; name: string; gender: Gender };

export type CommandType = Command['type'];

/** Minimum role per command. Checked by the engine so no caller can skip it. */
export const REQUIRED_ROLE: Record<CommandType, Role> = {
  importSignups: 'admin',
  addParticipant: 'admin',
  updateParticipant: 'admin',
  removeParticipant: 'admin',
  generateTeams: 'admin',
  swapPlayers: 'admin',
  setExtrasAsAlternates: 'admin',
  makePlan: 'admin',
  setTargetScore: 'admin',
  setLanes: 'manager',
  setManagerPassword: 'admin',
  publish: 'admin',
  unpublish: 'admin',
  start: 'manager',
  pause: 'manager',
  resume: 'manager',
  complete: 'admin',
  cancel: 'admin',
  reopen: 'admin',
  startMatch: 'manager',
  saveScore: 'manager',
  completeMatch: 'manager',
  correctMatch: 'manager',
  fillWildcard: 'manager',
  declineWildcard: 'manager',
  substitute: 'manager',
  lateAdd: 'manager',
};

/** Late adds are allowed once the bracket is published, until the first game goes on a lane. */
export const canLateAdd = (s: Pick<TournamentState, 'status' | 'matches'>) =>
  (s.status === 'READY' || s.status === 'IN_PROGRESS' || s.status === 'PAUSED') && !s.matches.some((m) => m.startedAt || m.status === 'done');

const RANK: Record<Role, number> = { spectator: 0, manager: 1, admin: 2 };
export const can = (actor: Actor, type: CommandType) => RANK[actor.role] >= RANK[REQUIRED_ROLE[type]];

export interface Ctx {
  now: string;
  rng: Rng;
}

export interface Result {
  state: TournamentState;
  events: TournamentEvent[];
  /** False when the command was a harmless repeat (e.g. double-tap on Finish). */
  changed: boolean;
}

export const MAX_SCORE = 999;
/** Autosaved in-progress scores kept on each game (the audit log keeps all of them). */
export const MAX_SAVED_SCORES = 5;

export function newTournament(year: string, game: GameId, now: string): TournamentState {
  return {
    id: `${year}#${game}`,
    year,
    game,
    name: `${year} ${GAMES[game].label} Tournament`,
    status: 'DRAFT',
    targetScore: GAMES[game].defaultTarget,
    lanes: GAMES[game].defaultLanes,
    participants: [],
    teams: [],
    extras: [],
    matches: [],
    wildcards: [],
    managerPasswordVersion: 0,
    nextTeamNo: 1,
    completedSeq: 0,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- Lookups ----------

const fail = (msg: string, code: TournamentError['code'] = 'invalid'): never => {
  throw new TournamentError(msg, code);
};

export const findMatch = (s: TournamentState, id: string) => s.matches.find((m) => m.id === id);
const getMatch = (s: TournamentState, id: string) => findMatch(s, id) ?? fail('That game was not found.', 'not_found');
const getTeam = (s: TournamentState, id: string) => s.teams.find((t) => t.id === id) ?? fail('That team was not found.', 'not_found');
const getWildcard = (s: TournamentState, id: string) =>
  s.wildcards.find((w) => w.id === id) ?? fail('That wildcard was not found.', 'not_found');
export const personName = (s: TournamentState, id: string) => s.participants.find((p) => p.personId === id)?.name ?? 'Unknown';

/** Teams that have lost a game. */
export const eliminatedTeamIds = (s: TournamentState) =>
  new Set(s.matches.filter((m) => m.status === 'done' && m.loserTeamId).map((m) => m.loserTeamId!));

/** Teams currently in the bracket (placed in a game slot, or on a filled wildcard) and not knocked out. */
export function activeTeamIds(s: TournamentState): Set<string> {
  const out = eliminatedTeamIds(s);
  const placed = new Set<string>();
  for (const m of s.matches) for (const sl of [m.a, m.b]) if (sl.teamId) placed.add(sl.teamId);
  // Before publish, every generated team counts as active.
  if (s.matches.length === 0) return new Set(s.teams.map((t) => t.id));
  return new Set([...placed].filter((id) => !out.has(id)));
}

const members = (t: Team) => [t.maleId, t.femaleId];

/** People who re-entered as a wildcard teammate. */
export const reenteredIds = (s: TournamentState) =>
  new Set(
    s.wildcards
      .filter((w) => w.teamId)
      .map((w) => {
        const t = s.teams.find((x) => x.id === w.teamId);
        return t ? (t.maleId === w.waitingPersonId ? t.femaleId : t.maleId) : '';
      })
      .filter(Boolean)
  );

/** People who are busy: on an active team, or waiting on an unfilled wildcard. */
function busyIds(s: TournamentState): Set<string> {
  const active = activeTeamIds(s);
  const busy = new Set<string>();
  for (const t of s.teams) if (active.has(t.id)) members(t).forEach((p) => busy.add(p));
  for (const w of s.wildcards) if (!w.teamId) busy.add(w.waitingPersonId);
  return busy;
}

/**
 * Who could fill a wildcard, best first: eliminated players of the needed gender in the order
 * their games finished (so the first loser is first), then alternates. Excludes people who
 * declined this slot, already re-entered once, or are busy.
 */
export function wildcardCandidates(s: TournamentState, w: WildcardSlot): { personId: string; why: 'loser' | 'alternate' }[] {
  const busy = busyIds(s);
  const reentered = reenteredIds(s);
  const out: { personId: string; why: 'loser' | 'alternate' }[] = [];
  const ok = (pid: string) => {
    const p = s.participants.find((x) => x.personId === pid);
    return (
      !!p &&
      !p.excluded &&
      p.gender === w.neededGender &&
      !busy.has(pid) &&
      !reentered.has(pid) &&
      !w.declined.includes(pid) &&
      pid !== w.waitingPersonId &&
      !out.some((o) => o.personId === pid)
    );
  };
  const done = s.matches.filter((m) => m.status === 'done' && m.loserTeamId).sort((a, b) => a.completedSeq! - b.completedSeq!);
  for (const m of done) {
    const t = s.teams.find((x) => x.id === m.loserTeamId);
    if (!t) continue;
    const pid = w.neededGender === 'M' ? t.maleId : t.femaleId;
    if (ok(pid)) out.push({ personId: pid, why: 'loser' });
  }
  // Alternates: extras who aren't waiting on a wildcard of their own.
  const waiting = new Set(s.wildcards.map((x) => x.waitingPersonId));
  for (const pid of s.extras) if (!waiting.has(pid) && ok(pid)) out.push({ personId: pid, why: 'alternate' });
  return out;
}

// ---------- Bracket mechanics ----------

const isBye = (m: Match) => m.a.source.type === 'bye' || m.b.source.type === 'bye';

/** Recompute a not-yet-played game's status from what's in its slots; resolve byes. */
function refresh(s: TournamentState, m: Match, ev: TournamentEvent[], ctx: Ctx) {
  if (m.status === 'live' || m.status === 'done') return;
  if (isBye(m)) {
    m.status = 'bye';
    const team = m.a.source.type === 'bye' ? m.b.teamId : m.a.teamId;
    if (team && m.winnerTeamId !== team) {
      m.winnerTeamId = team;
      m.version++;
      advance(s, m, team, ev, ctx);
    }
    return;
  }
  const next = m.a.teamId && m.b.teamId ? 'ready' : 'pending';
  if (m.status !== next) {
    m.status = next;
    m.version++;
  }
}

/** Put the winner of `m` into its next game. */
function advance(s: TournamentState, m: Match, teamId: string | undefined, ev: TournamentEvent[], ctx: Ctx) {
  if (!m.next) return;
  const n = getMatch(s, m.next.matchId);
  const slot = n[m.next.slot];
  if (slot.teamId === teamId) return;
  slot.teamId = teamId;
  n.version++;
  if (n.status === 'ready' && !teamId) n.status = 'pending';
  refresh(s, n, ev, ctx);
}

function validateScores(scoreA: number, scoreB: number) {
  for (const v of [scoreA, scoreB]) {
    if (!Number.isInteger(v) || v < 0 || v > MAX_SCORE) fail('Scores must be whole numbers from 0 to 999.');
  }
}

const sameResult = (m: Match, a: number, b: number) => m.scoreA === a && m.scoreB === b;

function finishTournamentIfFinal(s: TournamentState, m: Match, ev: TournamentEvent[], ctx: Ctx, actor: Actor) {
  if (m.next || m.status !== 'done') return;
  s.championTeamId = m.winnerTeamId;
  s.status = 'COMPLETED';
  s.completedAt = ctx.now;
  ev.push({ type: 'tournament_completed', actor: actor.id, at: ctx.now, teamId: m.winnerTeamId, note: 'Final finished' });
}

/** Undo a played game and everything the winner played afterwards (admin rollback). */
function resetDownstream(s: TournamentState, m: Match, ev: TournamentEvent[], ctx: Ctx, actor: Actor) {
  if (m.status === 'done' && m.next) {
    const n = getMatch(s, m.next.matchId);
    if (n.status === 'done' || n.status === 'live') resetDownstream(s, n, ev, ctx, actor);
  }
  const before = { status: m.status, scoreA: m.scoreA, scoreB: m.scoreB, winnerTeamId: m.winnerTeamId };
  if (m.loserTeamId) assertNotReentered(s, m.loserTeamId, 'roll back');
  m.status = 'pending';
  m.scoreA = m.scoreB = undefined;
  m.winnerTeamId = m.loserTeamId = undefined;
  m.startedAt = m.completedAt = m.completedBy = undefined;
  m.completedSeq = undefined;
  m.lane = undefined;
  m.version++;
  m.history.push({ at: ctx.now, by: actor.id, scoreA: 0, scoreB: 0, note: 'Rolled back' });
  if (m.next) advance(s, m, undefined, ev, ctx);
  if (s.championTeamId && !m.next) {
    s.championTeamId = undefined;
    s.completedAt = undefined;
    if (s.status === 'COMPLETED') s.status = 'IN_PROGRESS';
  }
  refresh(s, m, ev, ctx);
  ev.push({ type: 'match_rolled_back', actor: actor.id, at: ctx.now, matchId: m.id, before });
}

/** A losing team whose player came back as a wildcard can't be turned into a winner (they'd be on two teams). */
function assertNotReentered(s: TournamentState, teamId: string, what: string) {
  const t = getTeam(s, teamId);
  const re = reenteredIds(s);
  const p = members(t).find((x) => re.has(x));
  if (p) fail(`Can't ${what}: ${personName(s, p)} from that team has already come back as a wildcard.`);
}

// ---------- Apply ----------

export function apply(prev: TournamentState, cmd: Command, actor: Actor, ctx: Ctx): Result {
  if (!can(actor, cmd.type)) fail('You do not have permission to do that.', 'forbidden');
  const s: TournamentState = structuredClone(prev);
  const ev: TournamentEvent[] = [];
  const log = (type: string, extra: Partial<TournamentEvent> = {}) => ev.push({ type, actor: actor.id, at: ctx.now, ...extra });
  const draftOnly = () => {
    if (s.status !== 'DRAFT') fail('Teams and the bracket are locked once the tournament is published. Unpublish it first.');
  };
  const playing = () => {
    if (s.status === 'PAUSED') fail('The tournament is paused.');
    if (s.status !== 'IN_PROGRESS') fail('The tournament has not started yet.');
  };
  /** Anything that changes the pool or teams throws away the preview bracket. */
  const invalidatePlan = () => {
    s.plan = undefined;
  };
  const clearTeams = () => {
    s.teams = [];
    s.extras = [];
    s.wildcards = [];
    invalidatePlan();
  };
  let changed = true;

  switch (cmd.type) {
    case 'importSignups': {
      draftOnly();
      const before = s.participants.length;
      const incoming = new Map(cmd.signups.map((x) => [x.personId, x]));
      // Keep walk-ups and people still signed up; drop sign-ups that were withdrawn.
      s.participants = s.participants.filter((p) => p.source === 'walkup' || incoming.has(p.personId));
      for (const x of cmd.signups) {
        const p = s.participants.find((q) => q.personId === x.personId);
        if (p) {
          p.name = x.name;
          if (!p.gender && x.gender) p.gender = x.gender;
          p.source = 'signup';
        } else s.participants.push({ personId: x.personId, name: x.name, gender: x.gender, source: 'signup' });
      }
      clearTeams();
      log('participants_imported', { before, after: s.participants.length });
      break;
    }
    case 'addParticipant': {
      draftOnly();
      if (s.participants.some((p) => p.personId === cmd.personId)) fail(`${cmd.name} is already in this tournament.`);
      s.participants.push({ personId: cmd.personId, name: cmd.name, gender: cmd.gender, source: 'walkup' });
      clearTeams();
      log('participant_added', { personId: cmd.personId, after: { name: cmd.name, gender: cmd.gender } });
      break;
    }
    case 'updateParticipant': {
      draftOnly();
      const p = s.participants.find((q) => q.personId === cmd.personId) ?? fail('That person is not in this tournament.', 'not_found');
      const before = { gender: p.gender, excluded: !!p.excluded };
      if (cmd.gender !== undefined) p.gender = cmd.gender;
      if (cmd.excluded !== undefined) p.excluded = cmd.excluded;
      clearTeams();
      log('participant_updated', { personId: p.personId, before, after: { gender: p.gender, excluded: !!p.excluded } });
      break;
    }
    case 'removeParticipant': {
      draftOnly();
      const p = s.participants.find((q) => q.personId === cmd.personId) ?? fail('That person is not in this tournament.', 'not_found');
      s.participants = s.participants.filter((q) => q !== p);
      clearTeams();
      log('participant_removed', { personId: p.personId, before: { name: p.name } });
      break;
    }
    case 'generateTeams': {
      draftOnly();
      const { teams, extras, nextTeamNo } = generateTeams(s.participants, ctx.rng, s.nextTeamNo);
      if (teams.length === 0) fail('You need at least one man and one woman to make a team.');
      s.teams = teams;
      s.extras = extras;
      s.nextTeamNo = nextTeamNo;
      s.wildcards = wildcardsFor(s);
      invalidatePlan();
      log('teams_generated', { after: { teams: teams.length, extras: extras.length } });
      break;
    }
    case 'swapPlayers': {
      draftOnly();
      const a = s.participants.find((p) => p.personId === cmd.personA);
      const b = s.participants.find((p) => p.personId === cmd.personB);
      if (!a || !b || a === b) fail('Pick two different people to swap.');
      if (a!.gender !== b!.gender) fail('You can only swap a man with a man or a woman with a woman, so every team stays mixed.');
      const where = (pid: string) => {
        const t = s.teams.find((x) => x.maleId === pid || x.femaleId === pid);
        return t ? { team: t, key: (t.maleId === pid ? 'maleId' : 'femaleId') as 'maleId' | 'femaleId' } : null;
      };
      const wa = where(a!.personId);
      const wb = where(b!.personId);
      if (!wa && !wb) fail('Neither person is on a team.');
      if (wa) wa.team[wa.key] = b!.personId;
      if (wb) wb.team[wb.key] = a!.personId;
      // Swapping a team member with an extra moves the other person to the extras.
      if (wa && !wb) s.extras = s.extras.map((x) => (x === b!.personId ? a!.personId : x));
      if (wb && !wa) s.extras = s.extras.map((x) => (x === a!.personId ? b!.personId : x));
      s.wildcards = wildcardsFor(s);
      invalidatePlan();
      log('players_swapped', { personId: a!.personId, after: { swappedWith: b!.personId } });
      break;
    }
    case 'setExtrasAsAlternates': {
      draftOnly();
      s.extrasAsAlternates = cmd.value;
      s.wildcards = wildcardsFor(s);
      invalidatePlan();
      log('extras_mode', { after: cmd.value ? 'alternates' : 'wildcards' });
      break;
    }
    case 'makePlan': {
      draftOnly();
      if (s.teams.length === 0) fail('Make the teams first.');
      // Fit as many wildcards as the bracket allows; any extras beyond that sit out as alternates.
      let r = planBracket(s.teams, s.wildcards, ctx.rng, ctx.now);
      for (let w = s.wildcards.length - 1; !r.ok && w >= 0; w--) r = planBracket(s.teams, s.wildcards.slice(0, w), ctx.rng, ctx.now);
      if (!r.ok) fail(r.reason);
      s.plan = (r as Extract<typeof r, { ok: true }>).plan;
      log('bracket_previewed', {
        after: { size: s.plan!.size, wildcards: s.plan!.wildcards.length, alternates: s.extras.length - s.plan!.wildcards.length },
      });
      break;
    }
    case 'setTargetScore': {
      if (s.status === 'COMPLETED' || s.status === 'CANCELLED') fail('This tournament is finished.');
      if (!Number.isInteger(cmd.targetScore) || cmd.targetScore < 1 || cmd.targetScore > MAX_SCORE) fail('Pick a target score from 1 to 999.');
      log('target_score_set', { before: s.targetScore, after: cmd.targetScore });
      s.targetScore = cmd.targetScore;
      break;
    }
    case 'setManagerPassword': {
      s.managerPasswordHash = cmd.hash;
      s.managerPasswordVersion++;
      log('manager_password_set', { note: 'Managers on other phones are signed out.' });
      break;
    }

    case 'publish': {
      draftOnly();
      if (!s.plan) fail('Preview the bracket first.');
      validateTeams(s);
      s.matches = structuredClone(s.plan!.matches);
      s.wildcards = structuredClone(s.plan!.wildcards);
      for (const m of [...s.matches].sort((x, y) => x.round - y.round)) refresh(s, m, ev, ctx);
      s.status = 'READY';
      log('published', { after: { games: s.matches.length } });
      break;
    }
    case 'unpublish': {
      if (s.status !== 'READY') fail('Only a published tournament that has not started can be unpublished.');
      s.matches = [];
      s.status = 'DRAFT';
      log('unpublished');
      break;
    }
    case 'start': {
      if (s.status !== 'READY') fail('Publish the bracket before starting.');
      s.status = 'IN_PROGRESS';
      s.startedAt = ctx.now;
      log('started');
      break;
    }
    case 'pause': {
      if (s.status !== 'IN_PROGRESS') fail('Only a running tournament can be paused.');
      s.status = 'PAUSED';
      log('paused');
      break;
    }
    case 'resume': {
      if (s.status !== 'PAUSED') fail('The tournament is not paused.');
      s.status = 'IN_PROGRESS';
      log('resumed');
      break;
    }
    case 'complete': {
      const final = s.matches.find((m) => !m.next);
      if (!final || final.status !== 'done') fail('The final has not been played yet.');
      if (s.status === 'COMPLETED') {
        changed = false;
        break;
      }
      finishTournamentIfFinal(s, final!, ev, ctx, actor);
      break;
    }
    case 'cancel': {
      if (s.status === 'CANCELLED') {
        changed = false;
        break;
      }
      log('cancelled', { before: s.status });
      s.status = 'CANCELLED';
      break;
    }
    case 'reopen': {
      if (s.status !== 'COMPLETED' && s.status !== 'CANCELLED') fail('Only a finished or cancelled tournament can be reopened.');
      const before = s.status;
      s.status = s.matches.length === 0 ? 'DRAFT' : s.startedAt ? 'IN_PROGRESS' : 'READY';
      s.completedAt = undefined;
      log('reopened', { before, after: s.status });
      break;
    }

    case 'startMatch': {
      // Putting the first game on a lane starts a published tournament.
      if (s.status === 'READY') {
        s.status = 'IN_PROGRESS';
        s.startedAt = ctx.now;
        log('started');
      }
      playing();
      const m = getMatch(s, cmd.matchId);
      const name = GAMES[s.game].laneName.toLowerCase();
      const busy = new Set(s.matches.filter((x) => x.status === 'live' && x.id !== m.id && x.lane).map((x) => x.lane!));
      if (cmd.lane !== undefined && (!Number.isInteger(cmd.lane) || cmd.lane < 1 || cmd.lane > laneCount(s))) {
        fail(`There is no ${name} ${cmd.lane}.`);
      }
      if (m.status === 'live') {
        // Already playing: either a repeat tap, or moving it to another lane.
        if (cmd.lane === undefined || cmd.lane === m.lane) {
          changed = false;
          break;
        }
        if (busy.has(cmd.lane)) fail(`${GAMES[s.game].laneName} ${cmd.lane} is in use.`);
        log('match_moved', { matchId: m.id, before: m.lane, after: cmd.lane });
        m.lane = cmd.lane;
        m.version++;
        break;
      }
      if (m.status !== 'ready') fail(waitingReason(s, m));
      const free = freeLanes(s);
      if (free.length === 0) fail(`All ${laneCount(s)} ${name}s are in use. Finish a game first, or add a ${name}.`);
      const lane = cmd.lane ?? free[0];
      if (busy.has(lane)) fail(`${GAMES[s.game].laneName} ${lane} is in use.`);
      m.status = 'live';
      m.lane = lane;
      m.startedAt = ctx.now;
      m.scoreA ??= 0;
      m.scoreB ??= 0;
      m.version++;
      log('match_started', { matchId: m.id, after: { lane } });
      break;
    }
    case 'setLanes': {
      if (s.status === 'COMPLETED' || s.status === 'CANCELLED') fail('This tournament is finished.');
      if (!Number.isInteger(cmd.lanes) || cmd.lanes < 1 || cmd.lanes > MAX_LANES) fail(`Pick from 1 to ${MAX_LANES}.`);
      const name = GAMES[s.game].laneName.toLowerCase();
      const inUse = s.matches.filter((x) => x.status === 'live' && (x.lane ?? 0) > cmd.lanes);
      if (inUse.length) fail(`A game is still being played on ${name} ${inUse[0].lane}. Finish or move it first.`);
      if (laneCount(s) === cmd.lanes) {
        changed = false;
        break;
      }
      log('lanes_set', { before: laneCount(s), after: cmd.lanes });
      s.lanes = cmd.lanes;
      break;
    }
    case 'saveScore': {
      playing();
      validateScores(cmd.scoreA, cmd.scoreB);
      const m = getMatch(s, cmd.matchId);
      if (m.status === 'done') fail('That game is already finished. Use "Fix result" instead.');
      if (m.status !== 'live') fail('Start the game before entering scores.');
      if (sameResult(m, cmd.scoreA, cmd.scoreB)) {
        changed = false;
        break;
      }
      const before = { scoreA: m.scoreA, scoreB: m.scoreB };
      m.scoreA = cmd.scoreA;
      m.scoreB = cmd.scoreB;
      // Autosaves happen every few taps; keep only the latest few on the game (finals, fixes and
      // rollbacks are always kept). Every save is still in the audit log. Keeps the item small for 40+ teams.
      m.history.push({ at: ctx.now, by: actor.id, scoreA: cmd.scoreA, scoreB: cmd.scoreB });
      const saves = m.history.filter((h) => !h.note);
      if (saves.length > MAX_SAVED_SCORES) {
        const drop = new Set(saves.slice(0, saves.length - MAX_SAVED_SCORES));
        m.history = m.history.filter((h) => !drop.has(h));
      }
      m.version++;
      log('score_saved', { matchId: m.id, before, after: { scoreA: cmd.scoreA, scoreB: cmd.scoreB } });
      break;
    }
    case 'completeMatch': {
      validateScores(cmd.scoreA, cmd.scoreB);
      const m = getMatch(s, cmd.matchId);
      if (m.status === 'done') {
        // Double-tap / retried request with the same result: nothing to do.
        if (sameResult(m, cmd.scoreA, cmd.scoreB)) {
          changed = false;
          break;
        }
        fail('That game is already finished. Use "Fix result" to change it.', 'conflict');
      }
      playing();
      if (m.status !== 'live' && m.status !== 'ready') fail(waitingReason(s, m));
      if (cmd.scoreA === cmd.scoreB) fail('A game can’t end in a tie. Play it out, then enter the final score.');
      const [win, lose] = cmd.scoreA > cmd.scoreB ? [m.a.teamId!, m.b.teamId!] : [m.b.teamId!, m.a.teamId!];
      m.startedAt ??= ctx.now;
      m.scoreA = cmd.scoreA;
      m.scoreB = cmd.scoreB;
      m.winnerTeamId = win;
      m.loserTeamId = lose;
      m.status = 'done';
      m.completedAt = ctx.now;
      m.completedBy = actor.id;
      m.completedSeq = ++s.completedSeq;
      m.history.push({ at: ctx.now, by: actor.id, scoreA: cmd.scoreA, scoreB: cmd.scoreB, note: 'Final' });
      m.version++;
      log('match_completed', { matchId: m.id, teamId: win, after: { scoreA: cmd.scoreA, scoreB: cmd.scoreB, winner: win, loser: lose } });
      advance(s, m, win, ev, ctx);
      finishTournamentIfFinal(s, m, ev, ctx, actor);
      break;
    }
    case 'correctMatch': {
      validateScores(cmd.scoreA, cmd.scoreB);
      const m = getMatch(s, cmd.matchId);
      if (m.status !== 'done') fail('Only finished games can be fixed. For a game in progress, just change the score.');
      if (s.status === 'COMPLETED' && actor.role !== 'admin') fail('The tournament is finished. Only an admin can change results now.', 'forbidden');
      if (s.status !== 'COMPLETED' && s.status !== 'IN_PROGRESS' && s.status !== 'PAUSED') fail('This tournament is not running.');
      if (cmd.scoreA === cmd.scoreB) fail('A game can’t end in a tie.');
      if (sameResult(m, cmd.scoreA, cmd.scoreB)) {
        changed = false;
        break;
      }
      const before = { scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winnerTeamId };
      const [win, lose] = cmd.scoreA > cmd.scoreB ? [m.a.teamId!, m.b.teamId!] : [m.b.teamId!, m.a.teamId!];
      if (win !== m.winnerTeamId) {
        // The other team wins now. Anything the old winner already played must be undone first.
        const n = m.next ? getMatch(s, m.next.matchId) : undefined;
        if (n && (n.status === 'live' || n.status === 'done')) {
          if (!cmd.rollback) {
            fail(
              'The old winner has already played their next game. An admin has to roll back the later results to change this.',
              'conflict'
            );
          }
          if (actor.role !== 'admin') fail('Only an admin can roll back later results.', 'forbidden');
          resetDownstream(s, n, ev, ctx, actor);
        }
        // The old losers become winners again: none of them may have come back as a wildcard meanwhile.
        assertNotReentered(s, m.loserTeamId!, 'change the winner');
        m.winnerTeamId = win;
        m.loserTeamId = lose;
        if (!m.next && s.championTeamId) s.championTeamId = win;
        advance(s, m, win, ev, ctx);
      }
      m.scoreA = cmd.scoreA;
      m.scoreB = cmd.scoreB;
      m.history.push({ at: ctx.now, by: actor.id, scoreA: cmd.scoreA, scoreB: cmd.scoreB, note: 'Corrected' });
      m.version++;
      log('match_corrected', { matchId: m.id, before, after: { scoreA: cmd.scoreA, scoreB: cmd.scoreB, winner: win } });
      break;
    }
    case 'fillWildcard': {
      if (s.status !== 'IN_PROGRESS' && s.status !== 'PAUSED') fail('Wildcards are filled once play has started.');
      const w = getWildcard(s, cmd.wildcardId);
      if (w.teamId) fail('That wildcard team is already set.');
      const where = s.matches.find((m) => m.a.source.type === 'wildcard' && m.a.source.wildcardId === w.id) ??
        s.matches.find((m) => m.b.source.type === 'wildcard' && m.b.source.wildcardId === w.id);
      if (where && (where.status === 'live' || where.status === 'done')) fail('That game has already started.');
      const candidates = wildcardCandidates(s, w);
      if (!candidates.some((c) => c.personId === cmd.personId)) {
        fail(`${personName(s, cmd.personId)} can't take this wildcard spot (needs to be a ${w.neededGender === 'F' ? 'woman' : 'man'} who has lost a game and isn't on another team).`);
      }
      const team: Team = {
        id: `t${s.nextTeamNo++}`,
        maleId: w.neededGender === 'M' ? cmd.personId : w.waitingPersonId,
        femaleId: w.neededGender === 'F' ? cmd.personId : w.waitingPersonId,
        wildcardId: w.id,
      };
      s.teams.push(team);
      w.teamId = team.id;
      for (const m of s.matches) {
        for (const sl of [m.a, m.b]) {
          if (sl.source.type === 'wildcard' && sl.source.wildcardId === w.id) {
            sl.teamId = team.id;
            m.version++;
            refresh(s, m, ev, ctx);
          }
        }
      }
      log('wildcard_filled', { teamId: team.id, personId: cmd.personId, after: { wildcard: w.id, waiting: w.waitingPersonId } });
      break;
    }
    case 'declineWildcard': {
      const w = getWildcard(s, cmd.wildcardId);
      if (w.teamId) fail('That wildcard team is already set.');
      if (w.declined.includes(cmd.personId)) {
        changed = false;
        break;
      }
      w.declined.push(cmd.personId);
      log('wildcard_declined', { personId: cmd.personId, after: { wildcard: w.id } });
      break;
    }
    case 'substitute': {
      if (s.status !== 'IN_PROGRESS' && s.status !== 'PAUSED' && s.status !== 'READY') fail('Substitutions are for published tournaments.');
      const t = getTeam(s, cmd.teamId);
      if (!activeTeamIds(s).has(t.id)) fail('That team is out of the tournament.');
      const key = t.maleId === cmd.outPersonId ? 'maleId' : t.femaleId === cmd.outPersonId ? 'femaleId' : null;
      if (!key) fail(`${personName(s, cmd.outPersonId)} is not on that team.`);
      const live = s.matches.find((m) => m.status === 'live' && (m.a.teamId === t.id || m.b.teamId === t.id));
      if (live) fail('Finish their current game before swapping players.');
      const inP = s.participants.find((p) => p.personId === cmd.inPersonId);
      const needed: Gender = key === 'maleId' ? 'M' : 'F';
      if (!inP || inP.excluded || !isEligible(inP)) fail('Pick someone who is in this tournament.');
      if (inP!.gender !== needed) fail(`The substitute must be a ${needed === 'M' ? 'man' : 'woman'} so the team stays mixed.`);
      if (busyIds(s).has(inP!.personId)) fail(`${inP!.name} is already on a team that's still playing.`);
      t[key!] = inP!.personId;
      s.extras = s.extras.filter((x) => x !== inP!.personId);
      log('substitution', { teamId: t.id, personId: inP!.personId, before: cmd.outPersonId, after: cmd.inPersonId });
      break;
    }
    case 'lateAdd': {
      if (s.status === 'DRAFT') fail('The bracket isn\'t published yet. Add them on the setup page instead.');
      if (!canLateAdd(s)) fail('The first game has started, so no one new can join. You can still swap someone in as a substitute.');
      if (cmd.gender !== 'M' && cmd.gender !== 'F') fail('Pick man or woman.');
      const name = cmd.name.trim();
      if (!name) fail('Enter a name.');
      const dup = s.participants.find((p) => p.personId === cmd.personId || p.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) fail(`${dup.name} is already in this tournament.`);
      s.participants.push({ personId: cmd.personId, name, gender: cmd.gender, source: 'walkup' });
      s.plan = undefined; // the old preview no longer matches; unpublishing means previewing again

      // 1) Someone of the other gender is waiting for a wildcard partner: pair them up in that spot.
      const w = s.extrasAsAlternates ? undefined : s.wildcards.find((x) => !x.teamId && x.neededGender === cmd.gender);
      if (w) {
        const t: Team =
          cmd.gender === 'F'
            ? { id: `t${s.nextTeamNo++}`, maleId: w.waitingPersonId, femaleId: cmd.personId }
            : { id: `t${s.nextTeamNo++}`, maleId: cmd.personId, femaleId: w.waitingPersonId };
        s.teams.push(t);
        s.extras = s.extras.filter((x) => x !== w.waitingPersonId);
        s.wildcards = s.wildcards.filter((x) => x !== w);
        for (const m of s.matches)
          for (const k of ['a', 'b'] as const)
            if (m[k].source.type === 'wildcard' && (m[k].source as { wildcardId: string }).wildcardId === w.id) {
              m[k] = { source: { type: 'team', teamId: t.id }, teamId: t.id };
              m.version++;
            }
        for (const m of [...s.matches].sort((x, y) => x.round - y.round)) refresh(s, m, ev, ctx);
        log('late_add', { personId: cmd.personId, teamId: t.id, after: { name, gender: cmd.gender, pairedWith: w.waitingPersonId } });
        break;
      }

      // 2) Nobody to pair with: they wait for a wildcard partner. Teams stay; the bracket is redrawn to fit them.
      s.extras.push(cmd.personId);
      if (s.extrasAsAlternates) {
        log('late_add', { personId: cmd.personId, after: { name, gender: cmd.gender, alternate: true } });
        break;
      }
      const all = wildcardsFor(s);
      let r = planBracket(s.teams, all, ctx.rng, ctx.now);
      for (let n = all.length - 1; !r.ok && n >= 0; n--) r = planBracket(s.teams, all.slice(0, n), ctx.rng, ctx.now);
      if (!r.ok) fail(r.reason);
      const plan = (r as Extract<typeof r, { ok: true }>).plan;
      s.matches = structuredClone(plan.matches);
      s.wildcards = structuredClone(plan.wildcards);
      for (const m of [...s.matches].sort((x, y) => x.round - y.round)) refresh(s, m, ev, ctx);
      log('late_add', {
        personId: cmd.personId,
        after: { name, gender: cmd.gender, redrawn: true, wildcards: plan.wildcards.length, alternates: s.extras.length - plan.wildcards.length },
      });
      break;
    }
    default: {
      const never: never = cmd;
      fail(`Unknown command ${(never as { type: string }).type}`);
    }
  }

  if (!changed) return { state: prev, events: [], changed: false };
  s.updatedAt = ctx.now;
  s.version = prev.version + 1;
  assertInvariants(s);
  return { state: s, events: ev, changed: true };
}

/** Lanes (boards / pits) with no game being played, lowest first. */
export function freeLanes(s: TournamentState): number[] {
  const busy = new Set(s.matches.filter((m) => m.status === 'live' && m.lane).map((m) => m.lane!));
  return Array.from({ length: laneCount(s) }, (_, i) => i + 1).filter((l) => !busy.has(l));
}

/** Wildcard placeholders for the current extras (one per extra), unless extras sit out as alternates. */
function wildcardsFor(s: TournamentState): WildcardSlot[] {
  if (s.extrasAsAlternates) return [];
  return s.extras.map((pid, i) => {
    const g = s.participants.find((p) => p.personId === pid)?.gender;
    return { id: `W${i + 1}`, waitingPersonId: pid, neededGender: (g === 'M' ? 'F' : 'M') as Gender, declined: [] };
  });
}

function waitingReason(s: TournamentState, m: Match): string {
  if (m.status === 'bye') return 'That spot is a bye; nobody plays it.';
  // An empty slot fed by a bye that's holding a wildcard is waiting on the wildcard, not a game.
  const waitsOnWildcard = (sl: Match['a']): boolean => {
    if (sl.teamId) return false;
    if (sl.source.type === 'wildcard') return true;
    if (sl.source.type !== 'match') return false;
    const f = findMatch(s, sl.source.matchId);
    return !!f && f.status === 'bye' && (waitsOnWildcard(f.a) || waitsOnWildcard(f.b));
  };
  if (waitsOnWildcard(m.a) || waitsOnWildcard(m.b)) return 'Pick the wildcard teammate before starting this game.';
  if (!m.a.teamId || !m.b.teamId) return 'This game is waiting for an earlier game to finish.';
  return 'That game can’t be started right now.';
}

function validateTeams(s: TournamentState) {
  const seen = new Set<string>();
  for (const t of s.teams) {
    const m = s.participants.find((p) => p.personId === t.maleId);
    const f = s.participants.find((p) => p.personId === t.femaleId);
    if (!m || !f) fail('A team has someone who is no longer in the tournament. Make the teams again.');
    if (m!.gender !== 'M' || f!.gender !== 'F') fail('Every team needs one man and one woman.');
    for (const p of [m!, f!]) {
      if (p.excluded) fail(`${p.name} was left out but is still on a team. Make the teams again.`);
      if (seen.has(p.personId)) fail(`${p.name} is on two teams.`);
      seen.add(p.personId);
    }
  }
}

/** Last line of defence: never save a state that breaks these. */
export function assertInvariants(s: TournamentState) {
  // No one on two active teams.
  const active = activeTeamIds(s);
  const seen = new Map<string, string>();
  for (const t of s.teams) {
    if (!active.has(t.id)) continue;
    for (const p of members(t)) {
      if (seen.has(p)) throw new TournamentError(`${personName(s, p)} would be on two teams at once.`, 'conflict');
      seen.set(p, t.id);
    }
  }
  const ids = new Set(s.matches.map((m) => m.id));
  const teamIds = new Set(s.teams.map((t) => t.id));
  for (const m of s.matches) {
    if (m.a.teamId && m.a.teamId === m.b.teamId) throw new TournamentError('A team can’t play itself.', 'conflict');
    for (const sl of [m.a, m.b]) {
      if (sl.teamId && !teamIds.has(sl.teamId)) throw new TournamentError('A game points at a team that does not exist.', 'conflict');
      if (sl.source.type === 'match' && !ids.has(sl.source.matchId)) throw new TournamentError('Broken bracket link.', 'conflict');
    }
    // Bracket only flows forward (no loops).
    if (m.next) {
      const n = s.matches.find((x) => x.id === m.next!.matchId);
      if (!n || n.round <= m.round) throw new TournamentError('Broken bracket link.', 'conflict');
    }
    // A team can't be on both sides of a game via a wildcard teammate.
    if (m.a.teamId && m.b.teamId) {
      const ta = s.teams.find((t) => t.id === m.a.teamId)!;
      const tb = s.teams.find((t) => t.id === m.b.teamId)!;
      if (members(ta).some((p) => members(tb).includes(p))) {
        throw new TournamentError('The same person would be on both sides of a game.', 'conflict');
      }
    }
  }
}

export type { Participant };
