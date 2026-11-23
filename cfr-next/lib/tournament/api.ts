// Shared helpers for the /api/tournaments routes.

import { NextResponse } from 'next/server';
import { currentReunionYear } from '@/lib/reunion-config';
import { TournamentError, isGameId, type GameId } from './types';

export const noStore = { 'Cache-Control': 'no-store' };

/** Reunion years, plus far-future years for practice runs (e.g. 2099). */
export function parseYear(raw: string | null | undefined): string | null {
  const y = raw ?? currentReunionYear();
  return /^\d{4}$/.test(y) && Number(y) >= 2020 && Number(y) <= 2099 ? y : null;
}

export function parseGame(raw: string): GameId | null {
  return isGameId(raw) ? raw : null;
}

export function errorResponse(err: unknown, where: string) {
  if (err instanceof TournamentError) {
    const status = { invalid: 400, forbidden: 403, conflict: 409, not_found: 404 }[err.code];
    return NextResponse.json({ error: err.message, code: err.code }, { status, headers: noStore });
  }
  console.error(where, err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: noStore });
}

export const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: noStore });
