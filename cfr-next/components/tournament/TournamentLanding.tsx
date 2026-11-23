'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { currentReunionYear } from '@/lib/reunion-config';
import { useAuth } from '@/lib/auth/AuthContext';
import { isAdminEmail } from '@/lib/admin-emails';
import { useYearParam, withYear } from '@/lib/tournament/client';
import type { TournamentSummary } from '@/lib/tournament/view';
import { Skeleton, StatusPill } from './ui';

const ACCENT: Record<string, string> = {
  cornhole: 'from-red-600 to-rose-500',
  horseshoes: 'from-slate-800 to-slate-600',
};

export default function TournamentLanding() {
  const yearParam = useYearParam();
  const year = yearParam ?? currentReunionYear();
  const router = useRouter();
  const { user } = useAuth();
  const admin = isAdminEmail(user?.email);
  const [items, setItems] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch(`/api/tournaments?year=${year}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          if (stop) return;
          setItems(d.tournaments);
          setError(false);
        })
        .catch(() => !stop && setError(true));
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [year]);

  const thisYear = Number(currentReunionYear());
  const years = Array.from({ length: Math.max(1, thisYear - 2025) }, (_, i) => String(thisYear - i));
  if (!years.includes(year)) years.unshift(year);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        <Link href="/" className="inline-flex min-h-[44px] items-center text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="mr-1 h-4 w-4" /> churchwellreunion.com
        </Link>
        <header className="mt-4 mb-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-red-600" aria-hidden />
          <h1 className="mt-2 text-4xl font-bold text-slate-800 sm:text-5xl">Tournaments</h1>
          <div className="mx-auto my-4 h-1 w-24 rounded bg-red-600" />
          <p className="text-lg text-slate-600">Mixed teams, one man and one woman. Follow every game live.</p>
          <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600">
            Reunion
            <select
              value={year}
              onChange={(e) => router.push(e.target.value === currentReunionYear() ? '/tournament' : `/tournament?year=${e.target.value}`)}
              className="min-h-[44px] rounded-lg border-2 border-slate-200 bg-white px-2 font-semibold text-slate-800"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error && !items && (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-700 shadow">Couldn&apos;t load the tournaments. Check your connection.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {!items && !error
            ? [0, 1].map((i) => <Skeleton key={i} className="h-56" />)
            : items?.map((t) => (
                <div key={t.game} className="overflow-hidden rounded-2xl bg-white shadow-lg">
                  <Link
                    href={withYear(`/tournament/${t.game}`, yearParam)}
                    className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
                  >
                    <div className={cn('bg-gradient-to-br p-5 text-white', ACCENT[t.game] ?? 'from-slate-700 to-slate-500')}>
                      <div className="flex items-center justify-between">
                        <span className="text-4xl" aria-hidden>
                          {t.emoji}
                        </span>
                        <StatusPill status={t.status} className="bg-white/90 text-slate-900" />
                      </div>
                      <h2 className="mt-3 text-3xl font-bold">{t.gameLabel}</h2>
                    </div>
                    <div className="space-y-2 p-5">
                      {t.status !== 'NONE' && 'champion' in t && t.champion ? (
                        <div className="rounded-xl bg-amber-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Champions</p>
                          <p className="font-bold text-amber-950">
                            {t.champion.male} &amp; {t.champion.female}
                          </p>
                        </div>
                      ) : null}
                      <dl className="grid grid-cols-3 gap-2 text-center">
                        <Stat label="Teams" value={'teams' in t && t.teams ? String(t.teams) : '–'} />
                        <Stat label="Round" value={'currentRound' in t && t.currentRound ? t.currentRound : '–'} />
                        <Stat label="Games" value={'gamesTotal' in t && t.gamesTotal ? `${t.gamesPlayed}/${t.gamesTotal}` : '–'} />
                      </dl>
                      <p className="flex items-center justify-end text-sm font-semibold text-red-600">
                        {t.status === 'NONE' || t.status === 'DRAFT' ? 'Details' : 'Matches & bracket'} <ChevronRight className="h-4 w-4" />
                      </p>
                    </div>
                  </Link>
                  {admin && (
                    <Link
                      href={withYear(`/tournament/${t.game}/setup`, yearParam)}
                      className="flex min-h-[48px] items-center justify-center border-t border-slate-100 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Admin: set up {t.gameLabel.toLowerCase()}
                    </Link>
                  )}
                </div>
              ))}
        </div>
        {admin && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Want to try it first?{' '}
            <Link href="/tournament?year=2099" className="font-medium text-slate-700 underline underline-offset-4">
              Use the 2099 practice year
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-bold text-slate-800">{value}</dd>
    </div>
  );
}
