'use client';

// Browser side: live tournament data by light polling (works on Vercel, no extra AWS services).
// Each poll sends the last version; the server answers { unchanged } when nothing moved.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GameId, Role } from './types';
import type { TournamentView } from './view';

export type LiveStatus = 'loading' | 'live' | 'reconnecting' | 'offline';

const POLL_MS = 4000;

export function useYearParam(): string | undefined {
  const sp = useSearchParams();
  const y = sp?.get('year');
  return y && /^\d{4}$/.test(y) ? y : undefined;
}

/** Keep ?year= on internal links (practice years, past reunions). */
export const withYear = (href: string, year?: string) => (year ? `${href}${href.includes('?') ? '&' : '?'}year=${year}` : href);

export function useTournament(game: GameId, year?: string) {
  const [view, setView] = useState<TournamentView | null>(null);
  const [role, setRole] = useState<Role>('spectator');
  const [managerLogin, setManagerLogin] = useState(true);
  const [status, setStatus] = useState<LiveStatus>('loading');
  const [missing, setMissing] = useState(false);
  const versionRef = useRef<number | null>(null);
  const roleRef = useRef<Role>('spectator');
  const failures = useRef(0);
  const inflight = useRef(false);

  const fetchNow = useCallback(
    async (force = false) => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const qs = new URLSearchParams();
        if (year) qs.set('year', year);
        if (!force && versionRef.current !== null) {
          qs.set('since', String(versionRef.current));
          qs.set('role', roleRef.current);
        }
        const res = await fetch(`/api/tournaments/${game}?${qs}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        failures.current = 0;
        setStatus(navigator.onLine === false ? 'offline' : 'live');
        if (data.unchanged) return;
        setRole(data.role);
        roleRef.current = data.role;
        setManagerLogin(data.managerLogin !== false);
        setMissing(!data.view);
        setView(data.view);
        versionRef.current = data.view?.version ?? null;
      } catch {
        failures.current++;
        setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting');
      } finally {
        inflight.current = false;
      }
    },
    [game, year]
  );

  useEffect(() => {
    versionRef.current = null;
    fetchNow(true);
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      // Back off gently while the network is failing (4s, 8s, 16s, max 30s).
      const wait = Math.min(30_000, POLL_MS * 2 ** Math.max(0, failures.current - 1));
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await fetchNow();
        loop();
      }, failures.current ? wait : POLL_MS);
    };
    loop();
    const onVisible = () => document.visibilityState === 'visible' && fetchNow();
    const onOnline = () => fetchNow();
    const onOffline = () => setStatus('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [fetchNow]);

  /** Use the view returned by a command right away (no wait for the next poll). */
  const accept = useCallback((v: TournamentView, r?: Role) => {
    setView(v);
    setMissing(false);
    versionRef.current = v.version;
    if (r) {
      setRole(r);
      roleRef.current = r;
    }
  }, []);

  return { view, role, managerLogin, status, missing, refresh: () => fetchNow(true), accept };
}

export class CommandError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

export async function sendCommand(
  game: GameId,
  year: string,
  command: Record<string, unknown> & { type: string },
  expectedMatchVersion?: number
): Promise<{ view: TournamentView; role: Role }> {
  let res: Response;
  try {
    res = await fetch(`/api/tournaments/${game}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, command, expectedMatchVersion }),
    });
  } catch {
    throw new CommandError('No connection. Check your signal and try again.', 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CommandError(data.error || 'Something went wrong. Please try again.', data.code);
  return { view: data.view, role: data.role };
}
