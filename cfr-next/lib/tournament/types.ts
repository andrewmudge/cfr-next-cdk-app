// Shared tournament types. Pure data: no React, no AWS.
// The whole tournament lives in one TournamentState object (stored as one DynamoDB item),
// so every change is one conditional write. See lib/tournament/store.ts.

import type { GenderId } from '@/lib/reunion-config';

export type Gender = GenderId; // 'M' | 'F'

/** Games that can run a tournament. Add an entry here to support a new game. */
export const GAMES = {
  cornhole: { id: 'cornhole', label: 'Cornhole', emoji: '🌽', defaultTarget: 21 },
  horseshoes: { id: 'horseshoes', label: 'Horseshoes', emoji: '🐎', defaultTarget: 21 },
} as const;
export type GameId = keyof typeof GAMES;
export const GAME_IDS = Object.keys(GAMES) as [GameId, ...GameId[]];
export const isGameId = (g: string): g is GameId => g in GAMES;

export type TournamentStatus = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface Participant {
  personId: string;
  name: string;
  gender?: Gender;
  /** signup = imported from this year's sign-ups; walkup = added by the admin. */
  source: 'signup' | 'walkup';
  /** Admin can leave someone out (e.g. they changed their mind). */
  excluded?: boolean;
}

export interface Team {
  id: string;
  maleId: string;
  femaleId: string;
  /** Set when this team was formed from a wildcard slot during play. */
  wildcardId?: string;
}

/** A team that will be formed during play: a waiting extra + the first eligible loser of the other gender. */
export interface WildcardSlot {
  id: string; // W1, W2, ...
  /** The unpaired participant waiting to play. */
  waitingPersonId: string;
  /** Gender of the teammate still needed (opposite of the waiting person). */
  neededGender: Gender;
  /** People who were offered this slot and declined. */
  declined: string[];
  /** Filled in once the manager confirms a teammate. */
  teamId?: string;
}

export type SlotSource =
  | { type: 'team'; teamId: string }
  | { type: 'match'; matchId: string }
  | { type: 'bye' }
  | { type: 'wildcard'; wildcardId: string };

export interface Slot {
  source: SlotSource;
  /** The team currently in this slot (known for team sources, filled in as play goes on otherwise). */
  teamId?: string;
}

export type MatchStatus = 'pending' | 'ready' | 'live' | 'done' | 'bye';

export interface ScoreEntry {
  at: string;
  by: string;
  scoreA: number;
  scoreB: number;
  note?: string;
}

export interface Match {
  id: string; // r1m0
  round: number; // 1 = first round
  position: number; // 0-based within the round
  a: Slot;
  b: Slot;
  status: MatchStatus;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string;
  loserTeamId?: string;
  /** Where the winner goes. Absent on the final. */
  next?: { matchId: string; slot: 'a' | 'b' };
  /** Suggested play order (wildcard-dependent games come after the games that free up their players). */
  order: number;
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  /** Global completion sequence, used to find "the first loser". */
  completedSeq?: number;
  /** Bumped on every change to this match (optimistic concurrency from clients). */
  version: number;
  history: ScoreEntry[];
}

export interface BracketPlan {
  size: number; // power of two
  rounds: number;
  matches: Match[];
  wildcards: WildcardSlot[];
  createdAt: string;
}

export interface TournamentState {
  id: string; // `${year}#${game}`
  year: string;
  game: GameId;
  name: string;
  status: TournamentStatus;
  targetScore: number;
  participants: Participant[];
  teams: Team[];
  /** Unpaired participants after team generation (waiting for a wildcard, or alternates). */
  extras: string[];
  /** True when extras can't be fitted as wildcards and sit out as alternates instead. */
  extrasAsAlternates?: boolean;
  /** Bracket preview (DRAFT) — becomes `matches` on publish so what you previewed is what you get. */
  plan?: BracketPlan;
  matches: Match[];
  wildcards: WildcardSlot[];
  championTeamId?: string;
  /** Manager password (scrypt hash, never sent to clients) and a version that signs managers out when bumped. */
  managerPasswordHash?: string;
  managerPasswordVersion: number;
  /** Ids/sequences. */
  nextTeamNo: number;
  completedSeq: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type Role = 'spectator' | 'manager' | 'admin';

export interface Actor {
  role: Role;
  /** Admin email, or 'manager' for password-holders. */
  id: string;
}

export interface TournamentEvent {
  type: string;
  actor: string;
  at: string;
  matchId?: string;
  teamId?: string;
  personId?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}

/** Deterministic-friendly random source: returns an integer in [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

export class TournamentError extends Error {
  constructor(
    message: string,
    public code: 'invalid' | 'forbidden' | 'conflict' | 'not_found' = 'invalid'
  ) {
    super(message);
  }
}
