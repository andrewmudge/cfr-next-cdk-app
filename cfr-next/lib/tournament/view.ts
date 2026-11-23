// What the browser gets. Built from TournamentState: names only, never the password hash.

import { activeTeamIds, eliminatedTeamIds, reenteredIds, wildcardCandidates } from './engine';
import { needsReview } from './teams';
import { roundLabel } from './plan';
import { GAMES, laneCount, type GameId, type Gender, type Match, type Role, type TournamentState, type TournamentStatus } from './types';

export type TeamStatus = 'active' | 'eliminated' | 'champion';

export interface ViewPlayer {
  personId: string;
  name: string;
  gender: Gender;
  reentered?: boolean;
}

export interface ViewTeam {
  id: string;
  label: string;
  male: ViewPlayer;
  female: ViewPlayer;
  status: TeamStatus;
  wildcardId?: string;
  wins: number;
  losses: number;
}

export interface ViewSlot {
  teamId?: string;
  /** What to show when no team is here yet. */
  placeholder?: string;
  kind: 'team' | 'match' | 'bye' | 'wildcard';
  wildcardId?: string;
}

export interface ViewMatch extends Omit<Match, 'a' | 'b'> {
  number: number; // friendly "Game 3"
  roundLabel: string;
  a: ViewSlot;
  b: ViewSlot;
}

export interface ViewWildcard {
  id: string;
  waiting: ViewPlayer;
  neededGender: Gender;
  teamId?: string;
  declined: string[];
  /** Best first. Only filled in for managers/admins. */
  candidates?: { personId: string; name: string; why: 'loser' | 'alternate' }[];
}

export interface ViewParticipant {
  personId: string;
  name: string;
  gender?: Gender;
  source: 'signup' | 'walkup';
  excluded?: boolean;
  needsReview: boolean;
  /** Where they are now. */
  state: 'on_team' | 'waiting' | 'alternate' | 'eliminated' | 'unassigned' | 'excluded' | 'needs_review';
}

export interface TournamentView {
  id: string;
  year: string;
  game: GameId;
  gameLabel: string;
  emoji: string;
  name: string;
  status: TournamentStatus;
  targetScore: number;
  /** Boards (cornhole) / pits (horseshoes): how many games run at once. */
  lanes: number;
  laneName: string;
  /** Each lane and the game playing on it now (if any). */
  laneBoard: { lane: number; liveMatchId?: string }[];
  /** The next ready games in play order, one per lane. These go on as lanes free up. */
  upNext: string[];
  /** Other ready games, in play order. A manager can start one early if an up-next team isn't here. */
  onDeck: string[];
  version: number;
  updatedAt: string;
  rounds: number;
  currentRound?: number;
  gamesPlayed: number;
  gamesTotal: number;
  champion?: ViewTeam;
  teams: ViewTeam[];
  matches: ViewMatch[];
  wildcards: ViewWildcard[];
  counts: { men: number; women: number; needsReview: number; teams: number; extras: number };
  hasManagerPassword: boolean;
  /** Staff only: people free to sub in (in the tournament, not on a team that's still playing). */
  bench?: { personId: string; name: string; gender: Gender }[];
  /** Setup data: only for admins. */
  setup?: {
    participants: ViewParticipant[];
    extras: string[];
    extrasAsAlternates: boolean;
    plan?: { size: number; rounds: number; matches: ViewMatch[]; wildcards: ViewWildcard[] };
  };
}

const short = (name: string) => {
  // Display names can carry a family hint, e.g. "Darrell Churchwell (son of Cecil & Marshall)".
  const parts = name.replace(/\s*\(.*\)\s*$/, '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

export function buildView(s: TournamentState, role: Role): TournamentView {
  const byId = new Map(s.participants.map((p) => [p.personId, p]));
  const player = (pid: string): ViewPlayer => ({
    personId: pid,
    name: byId.get(pid)?.name ?? 'Unknown',
    gender: byId.get(pid)?.gender ?? 'M',
  });
  const reentered = reenteredIds(s);
  const eliminated = eliminatedTeamIds(s);
  const active = activeTeamIds(s);

  const record = (teamId: string) => {
    let wins = 0;
    let losses = 0;
    for (const m of s.matches) {
      if (m.status !== 'done') continue;
      if (m.winnerTeamId === teamId) wins++;
      if (m.loserTeamId === teamId) losses++;
    }
    return { wins, losses };
  };

  const teams: ViewTeam[] = s.teams.map((t) => {
    const male = { ...player(t.maleId), reentered: !!t.wildcardId && reentered.has(t.maleId) };
    const female = { ...player(t.femaleId), reentered: !!t.wildcardId && reentered.has(t.femaleId) };
    return {
      id: t.id,
      label: `${short(male.name)} & ${short(female.name)}`,
      male,
      female,
      status: s.championTeamId === t.id ? 'champion' : eliminated.has(t.id) ? 'eliminated' : 'active',
      wildcardId: t.wildcardId,
      ...record(t.id),
    };
  });

  const staff = role !== 'spectator';
  const viewWildcards = (list: typeof s.wildcards): ViewWildcard[] =>
    list.map((w) => ({
      id: w.id,
      waiting: player(w.waitingPersonId),
      neededGender: w.neededGender,
      teamId: w.teamId,
      declined: w.declined,
      candidates:
        staff && !w.teamId && s.matches.length
          ? wildcardCandidates(s, w).map((c) => ({ ...c, name: byId.get(c.personId)?.name ?? 'Unknown' }))
          : undefined,
    }));

  const viewMatches = (list: Match[], rounds: number): ViewMatch[] => {
    const played = [...list].filter((m) => !(m.a.source.type === 'bye' || m.b.source.type === 'bye')).sort((x, y) => x.order - y.order);
    const number = new Map(played.map((m, i) => [m.id, i + 1]));
    const wildLabel = (wildcardId: string) => {
      const w = s.wildcards.find((x) => x.id === wildcardId) ?? s.plan?.wildcards.find((x) => x.id === wildcardId);
      return w ? `${short(player(w.waitingPersonId).name)} + wildcard` : 'Wildcard';
    };
    const byMatchId = new Map(list.map((m) => [m.id, m]));
    const slot = (m: Match, side: 'a' | 'b'): ViewSlot => {
      const sl = m[side];
      const src = sl.source;
      const v: ViewSlot = { teamId: sl.teamId, kind: src.type };
      if (src.type === 'wildcard') v.wildcardId = src.wildcardId;
      if (!sl.teamId) {
        if (src.type === 'bye') v.placeholder = 'Bye';
        else if (src.type === 'match') {
          const n = number.get(src.matchId);
          const feeder = byMatchId.get(src.matchId);
          // A bye feeding this slot just passes its one entrant through: name that entrant.
          const through = feeder && (feeder.a.source.type === 'bye' ? feeder.b : feeder.b.source.type === 'bye' ? feeder.a : undefined);
          if (n) v.placeholder = `Winner of Game ${n}`;
          else if (through?.source.type === 'wildcard') v.placeholder = wildLabel(through.source.wildcardId);
          else v.placeholder = 'TBD';
        } else if (src.type === 'wildcard') {
          v.placeholder = wildLabel(src.wildcardId);
        }
      }
      return v;
    };
    return list.map((m) => ({
      ...m,
      number: number.get(m.id) ?? 0,
      roundLabel: roundLabel(m.round, rounds),
      a: slot(m, 'a'),
      b: slot(m, 'b'),
      // Score history is for staff only.
      history: staff ? m.history : [],
      completedBy: staff ? m.completedBy : undefined,
    }));
  };

  const rounds = s.matches.length ? Math.max(...s.matches.map((m) => m.round)) : 0;
  const realGames = s.matches.filter((m) => m.status !== 'bye');
  const open = realGames.filter((m) => m.status !== 'done');
  const eligible = s.participants.filter((p) => !p.excluded);

  const view: TournamentView = {
    id: s.id,
    year: s.year,
    game: s.game,
    gameLabel: GAMES[s.game].label,
    emoji: GAMES[s.game].emoji,
    name: s.name,
    status: s.status,
    targetScore: s.targetScore,
    lanes: laneCount(s),
    laneName: GAMES[s.game].laneName,
    ...laneQueue(s),
    version: s.version,
    updatedAt: s.updatedAt,
    rounds,
    currentRound: open.length ? Math.min(...open.map((m) => m.round)) : undefined,
    gamesPlayed: realGames.length - open.length,
    gamesTotal: realGames.length,
    champion: teams.find((t) => t.id === s.championTeamId),
    teams,
    matches: viewMatches(s.matches, rounds),
    wildcards: viewWildcards(s.wildcards),
    counts: {
      men: eligible.filter((p) => p.gender === 'M').length,
      women: eligible.filter((p) => p.gender === 'F').length,
      needsReview: s.participants.filter(needsReview).length,
      teams: s.teams.filter((t) => !t.wildcardId).length,
      extras: s.extras.length,
    },
    hasManagerPassword: !!s.managerPasswordHash,
  };

  if (staff && s.matches.length) {
    const busy = new Set(s.teams.filter((t) => active.has(t.id)).flatMap((t) => [t.maleId, t.femaleId]));
    s.wildcards.filter((w) => !w.teamId).forEach((w) => busy.add(w.waitingPersonId));
    view.bench = s.participants
      .filter((p) => !p.excluded && (p.gender === 'M' || p.gender === 'F') && !busy.has(p.personId))
      .map((p) => ({ personId: p.personId, name: p.name, gender: p.gender! }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Before publishing, spectators only see that it's coming.
  if (s.status === 'DRAFT' && role !== 'admin') {
    view.teams = [];
    view.matches = [];
    view.wildcards = [];
  }

  if (role === 'admin') {
    const onTeam = new Set(s.teams.filter((t) => active.has(t.id)).flatMap((t) => [t.maleId, t.femaleId]));
    const out = new Set(s.teams.filter((t) => eliminated.has(t.id)).flatMap((t) => [t.maleId, t.femaleId]));
    const waiting = new Set(s.wildcards.filter((w) => !w.teamId).map((w) => w.waitingPersonId));
    view.setup = {
      participants: s.participants
        .map((p): ViewParticipant => ({
          personId: p.personId,
          name: p.name,
          gender: p.gender,
          source: p.source,
          excluded: p.excluded,
          needsReview: needsReview(p),
          state: p.excluded
            ? 'excluded'
            : needsReview(p)
              ? 'needs_review'
              : onTeam.has(p.personId)
                ? 'on_team'
                : waiting.has(p.personId)
                  ? 'waiting'
                  : out.has(p.personId)
                    ? 'eliminated'
                    : s.extras.includes(p.personId)
                      ? 'alternate'
                      : 'unassigned',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      extras: s.extras,
      extrasAsAlternates: !!s.extrasAsAlternates,
      plan: s.plan
        ? {
            size: s.plan.size,
            rounds: s.plan.rounds,
            matches: viewMatches(s.plan.matches, s.plan.rounds),
            wildcards: viewWildcards(s.plan.wildcards),
          }
        : undefined,
    };
  }
  return view;
}

/** Who is on which lane now, the next games up (one per lane), and the other ready games. */
function laneQueue(s: TournamentState) {
  const n = laneCount(s);
  const live = s.matches.filter((m) => m.status === 'live');
  const ready = s.matches.filter((m) => m.status === 'ready').sort((a, b) => a.order - b.order);
  const board: { lane: number; liveMatchId?: string }[] = Array.from({ length: n }, (_, i) => ({ lane: i + 1 }));
  // Games started before lanes existed (no lane) take the first open spots.
  for (const m of live) {
    const spot = (m.lane && board[m.lane - 1] && !board[m.lane - 1].liveMatchId ? board[m.lane - 1] : undefined) ?? board.find((b) => !b.liveMatchId);
    if (spot) spot.liveMatchId = m.id;
  }
  return { laneBoard: board, upNext: ready.slice(0, n).map((m) => m.id), onDeck: ready.slice(n).map((m) => m.id) };
}

/** Small summary for the landing page cards. */
export function summarize(s: TournamentState | null, game: GameId, year: string) {
  if (!s) return { game, year, gameLabel: GAMES[game].label, emoji: GAMES[game].emoji, status: 'NONE' as const };
  const v = buildView(s, 'spectator');
  return {
    game,
    year,
    gameLabel: v.gameLabel,
    emoji: v.emoji,
    status: v.status,
    teams: s.status === 'DRAFT' ? 0 : v.teams.length,
    currentRound: v.currentRound ? v.matches.find((m) => m.round === v.currentRound)?.roundLabel : undefined,
    gamesPlayed: v.gamesPlayed,
    gamesTotal: v.gamesTotal,
    champion: v.champion ? { label: v.champion.label, male: v.champion.male.name, female: v.champion.female.name } : undefined,
  };
}
export type TournamentSummary = ReturnType<typeof summarize>;
