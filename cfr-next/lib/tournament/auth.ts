// Who is calling: admin (Cognito idToken, lib/admin-auth.ts), manager (password cookie), or spectator.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import type { Actor, GameId, TournamentState } from './types';

const secret = () => process.env.TOURNAMENT_SECRET || process.env.COGNITO_JWT_SECRET || '';
export const managerLoginAvailable = () => !!secret();

export const managerCookieName = (year: string, game: GameId) => `tmgr_${year}_${game}`;
export const MANAGER_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // a reunion week

const sign = (s: Pick<TournamentState, 'id' | 'managerPasswordVersion'>) =>
  createHmac('sha256', secret()).update(`tournament-manager|${s.id}|${s.managerPasswordVersion}`).digest('base64url');

/** Cookie value for a manager who just entered the right password. */
export const managerCookieValue = (s: TournamentState) => `${s.managerPasswordVersion}.${sign(s)}`;

export function validManagerCookie(value: string | undefined, s: TournamentState | null): boolean {
  if (!value || !s?.managerPasswordHash || !secret()) return false;
  const [v, sig] = value.split('.');
  if (Number(v) !== s.managerPasswordVersion || !sig) return false;
  const want = Buffer.from(sign(s));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function getActor(year: string, game: GameId, s: TournamentState | null): Promise<Actor> {
  const admin = await getVerifiedAdmin();
  if (admin) return { role: 'admin', id: admin };
  const c = (await cookies()).get(managerCookieName(year, game))?.value;
  if (validManagerCookie(c, s)) return { role: 'manager', id: 'manager' };
  return { role: 'spectator', id: 'spectator' };
}

// ---------- Password hashing (scrypt) ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored?: string): boolean {
  if (!stored) return false;
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(password, salt, 32);
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}
