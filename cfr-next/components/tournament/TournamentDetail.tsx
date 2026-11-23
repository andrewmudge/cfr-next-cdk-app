'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, Loader2, LogOut, Minus, Plus, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { currentReunionYear } from '@/lib/reunion-config';
import { sendCommand, useTournament, useYearParam, withYear } from '@/lib/tournament/client';
import type { GameId } from '@/lib/tournament/types';
import type { TournamentView, ViewMatch, ViewTeam } from '@/lib/tournament/view';
import BracketView from './BracketView';
import { ChampionBanner, LiveIndicator, MatchCard, Skeleton, StatusPill, teamById } from './ui';

type Tab = 'matches' | 'bracket' | 'teams';

export default function TournamentDetail({ game }: { game: GameId }) {
  const yearParam = useYearParam();
  const year = yearParam ?? currentReunionYear();
  const router = useRouter();
  const { view, role, managerLogin, status, missing, refresh, accept } = useTournament(game, yearParam);
  const [tab, setTab] = useState<Tab>('matches');
  const [manageOpen, setManageOpen] = useState(false);
  const [info, setInfo] = useState<ViewMatch | null>(null);
  const staff = role !== 'spectator';

  const open = (m: ViewMatch) => {
    if (staff && view && (view.status === 'IN_PROGRESS' || view.status === 'PAUSED' || view.status === 'COMPLETED')) {
      router.push(withYear(`/tournament/${game}/match/${m.id}`, yearParam));
    } else setInfo(m);
  };

  const signOut = async () => {
    await fetch(`/api/tournaments/${game}/manage?year=${year}`, { method: 'DELETE' });
    toast.success('You are no longer managing on this phone.');
    refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={withYear('/tournament', yearParam)} className="inline-flex min-h-[44px] items-center text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="mr-1 h-4 w-4" /> Tournaments
          </Link>
          <LiveIndicator status={status} />
        </div>

        {!view && !missing ? (
          <div className="space-y-4 pt-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : missing || !view ? (
          <div className="mt-10 rounded-2xl bg-white p-8 text-center shadow">
            <p className="text-lg font-semibold text-slate-800">This tournament hasn&apos;t been set up yet.</p>
            <p className="mt-1 text-slate-600">Check back closer to the reunion.</p>
            {role === 'admin' && (
              <Button asChild className="mt-4 min-h-[48px] bg-red-600 hover:bg-red-700">
                <Link href={withYear(`/tournament/${game}/setup`, yearParam)}>Set it up</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <header className="mt-2 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold text-slate-800 sm:text-4xl">
                  <span aria-hidden>{view.emoji}</span> {view.gameLabel}
                </h1>
                <StatusPill status={view.status} />
              </div>
              <p className="mt-1 text-slate-600">
                {view.year} · {view.teams.length ? `${view.teams.length} teams` : 'Teams coming soon'}
                {view.gamesTotal > 0 && ` · ${view.gamesPlayed} of ${view.gamesTotal} games played`}
                {view.status !== 'COMPLETED' && view.targetScore ? ` · games to ${view.targetScore}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {role === 'admin' && (
                  <Button asChild variant="outline" className="min-h-[44px]">
                    <Link href={withYear(`/tournament/${game}/setup`, yearParam)}>
                      <Settings className="mr-2 h-4 w-4" /> Set up
                    </Link>
                  </Button>
                )}
                {role === 'spectator' && view.hasManagerPassword && managerLogin && (
                  <Button variant="outline" className="min-h-[44px]" onClick={() => setManageOpen(true)}>
                    <KeyRound className="mr-2 h-4 w-4" /> Manage
                  </Button>
                )}
                {staff && view.status !== 'COMPLETED' && view.status !== 'CANCELLED' && (
                  <LaneCounter game={game} year={year} lanes={view.lanes} laneName={view.laneName} onChange={accept} />
                )}
                {role === 'manager' && (
                  <>
                    <span className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-50 px-3 text-sm font-medium text-emerald-800">
                      You&apos;re managing. Tap a game to score it.
                    </span>
                    <Button variant="ghost" className="min-h-[44px]" onClick={signOut}>
                      <LogOut className="mr-2 h-4 w-4" /> Stop managing
                    </Button>
                  </>
                )}
              </div>
            </header>

            {view.champion && (
              <div className="mb-6">
                <ChampionBanner team={view.champion} gameLabel={view.gameLabel} />
              </div>
            )}

            {view.status === 'DRAFT' ? (
              <div className="rounded-2xl bg-white p-8 text-center shadow">
                <p className="text-lg font-semibold text-slate-800">Teams and the bracket are being put together.</p>
                <p className="mt-1 text-slate-600">They&apos;ll show up here as soon as they&apos;re ready.</p>
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-20 -mx-4 mb-4 bg-slate-50/95 px-4 py-2 backdrop-blur">
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist" aria-label="Views">
                    {(['matches', 'bracket', 'teams'] as Tab[]).map((t) => (
                      <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        className={cn(
                          'min-h-[44px] rounded-lg text-sm font-semibold capitalize transition-colors',
                          tab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {tab === 'matches' && <MatchesView view={view} onOpen={open} staff={staff} />}
                {tab === 'bracket' && <BracketView view={view} matches={view.matches} onOpen={open} />}
                {tab === 'teams' && <TeamsView view={view} />}
              </>
            )}
          </>
        )}
      </div>

      <ManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        game={game}
        year={year}
        onDone={() => {
          setManageOpen(false);
          refresh();
        }}
      />
      {view && <MatchInfoDialog view={view} match={info} onClose={() => setInfo(null)} />}
    </div>
  );
}

function LaneCounter({
  game,
  year,
  lanes,
  laneName,
  onChange,
}: {
  game: GameId;
  year: string;
  lanes: number;
  laneName: string;
  onChange: ReturnType<typeof useTournament>['accept'];
}) {
  const [busy, setBusy] = useState(false);
  const set = async (n: number) => {
    setBusy(true);
    try {
      const r = await sendCommand(game, year, { type: 'setLanes', lanes: n });
      onChange(r.view, r.role);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border-2 border-slate-200 bg-white px-1" role="group" aria-label={`Number of ${laneName.toLowerCase()}s`}>
      <button
        type="button"
        aria-label={`One less ${laneName.toLowerCase()}`}
        disabled={busy || lanes <= 1}
        onClick={() => set(lanes - 1)}
        className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[5.5rem] text-center text-sm font-semibold text-slate-800" aria-live="polite">
        {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `${lanes} ${laneName.toLowerCase()}${lanes === 1 ? '' : 's'}`}
      </span>
      <button
        type="button"
        aria-label={`One more ${laneName.toLowerCase()}`}
        disabled={busy || lanes >= 20}
        onClick={() => set(lanes + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function MatchesView({ view, onOpen, staff }: { view: TournamentView; onOpen: (m: ViewMatch) => void; staff: boolean }) {
  const games = view.matches.filter((m) => m.status !== 'bye');
  const byIdM = new Map(view.matches.map((m) => [m.id, m]));
  const onDeck = view.onDeck.map((id) => byIdM.get(id)!).filter(Boolean);
  const playing = view.status === 'IN_PROGRESS' || view.status === 'PAUSED' || view.status === 'READY';
  const byRound = useMemo(() => {
    const map = new Map<number, ViewMatch[]>();
    for (const m of [...games].sort((a, b) => a.order - b.order)) map.set(m.round, [...(map.get(m.round) ?? []), m]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [games]);
  const byes = view.matches.filter((m) => m.status === 'bye' && m.round === 1);

  const Section = ({ title, list, accent }: { title: string; list: ViewMatch[]; accent?: boolean }) =>
    list.length ? (
      <section className="space-y-2">
        <h2 className={cn('text-sm font-bold uppercase tracking-wider', accent ? 'text-red-600' : 'text-slate-500')}>{title}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <MatchCard key={m.id} view={view} m={m} onOpen={onOpen} laneName={view.laneName} />
          ))}
        </div>
      </section>
    ) : null;
  const anyLaneUsed = view.laneBoard.some((b) => b.liveMatchId || b.nextMatchId);

  return (
    <div className="space-y-6">
      {view.status === 'PAUSED' && (
        <p className="rounded-xl bg-slate-200 p-3 text-center text-sm font-medium text-slate-700">The tournament is paused for now.</p>
      )}
      {playing && anyLaneUsed && (
        <section className="space-y-2" aria-label={`${view.laneName}s`}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-red-600">On the {view.laneName.toLowerCase()}s</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {view.laneBoard.map((b) => {
              const m = b.liveMatchId ? byIdM.get(b.liveMatchId) : b.nextMatchId ? byIdM.get(b.nextMatchId) : undefined;
              return (
                <div key={b.lane} className="space-y-1">
                  <p className="flex items-center justify-between px-1 text-xs font-semibold">
                    <span className="text-slate-700">
                      {view.laneName} {b.lane}
                    </span>
                    <span className={b.liveMatchId ? 'text-red-600' : m ? 'text-emerald-700' : 'text-slate-400'}>
                      {b.liveMatchId ? 'Playing' : m ? 'Up next' : 'Open'}
                    </span>
                  </p>
                  {m ? (
                    <MatchCard view={view} m={m} onOpen={onOpen} />
                  ) : (
                    <div className="flex h-[108px] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
                      Nothing ready yet
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <Section title="On deck" list={onDeck} />
      {staff && view.wildcards.some((w) => !w.teamId) && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          Wildcard spots fill as players lose. Open a game marked &quot;Waiting for wildcard&quot; to pick the teammate.
        </p>
      )}
      {byRound.map(([round, list]) => (
        <Section key={round} title={list[0].roundLabel} list={list} />
      ))}
      {byes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">First-round byes</h2>
          <ul className="flex flex-wrap gap-2 text-sm text-slate-600">
            {byes.map((b) => (
              <li key={b.id} className="rounded-full bg-white px-3 py-1.5 shadow-sm">
                {teamById(view, b.winnerTeamId)?.label ?? b.a.placeholder ?? b.b.placeholder}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const TEAM_BADGE: Record<ViewTeam['status'], { text: string; cls: string }> = {
  active: { text: 'Still in', cls: 'bg-emerald-100 text-emerald-900' },
  eliminated: { text: 'Out', cls: 'bg-slate-100 text-slate-500' },
  champion: { text: 'Champions', cls: 'bg-amber-200 text-amber-950' },
};

function TeamsView({ view }: { view: TournamentView }) {
  const order = { champion: 0, active: 1, eliminated: 2 };
  const teams = [...view.teams].sort((a, b) => order[a.status] - order[b.status] || a.label.localeCompare(b.label));
  const waiting = view.wildcards.filter((w) => !w.teamId);
  return (
    <div className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <li key={t.id} className={cn('rounded-xl border-2 bg-white p-3', t.status === 'eliminated' ? 'border-slate-100' : 'border-slate-200')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn('font-semibold', t.status === 'eliminated' ? 'text-slate-500' : 'text-slate-800')}>{t.male.name}</p>
                <p className={cn('font-semibold', t.status === 'eliminated' ? 'text-slate-500' : 'text-slate-800')}>{t.female.name}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', TEAM_BADGE[t.status].cls)}>{TEAM_BADGE[t.status].text}</span>
                {t.wildcardId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    <Sparkles className="h-3 w-3" /> Wildcard
                  </span>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t.wins}–{t.losses}
              {(t.male.reentered || t.female.reentered) && ` · ${(t.male.reentered ? t.male : t.female).name.split(' ')[0]} came back as a wildcard`}
            </p>
          </li>
        ))}
      </ul>
      {waiting.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Waiting for a wildcard teammate</p>
          <ul className="mt-1 list-disc pl-5">
            {waiting.map((w) => (
              <li key={w.id}>
                {w.waiting.name} will team up with the first {w.neededGender === 'F' ? 'woman' : 'man'} knocked out.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ManageDialog({
  open,
  onOpenChange,
  game,
  year,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  game: GameId;
  year: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/tournaments/${game}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not sign in.');
      setPassword('');
      toast.success('You can now run this tournament from this phone.');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage this tournament</DialogTitle>
          <DialogDescription>Enter the manager password you were given.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full min-h-[52px] rounded-xl border-2 border-slate-300 px-4 text-base focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
            placeholder="Password"
            aria-label="Manager password"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !password} className="w-full min-h-[52px] bg-red-600 text-base hover:bg-red-700">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Start managing'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MatchInfoDialog({ view, match, onClose }: { view: TournamentView; match: ViewMatch | null; onClose: () => void }) {
  const m = match ? view.matches.find((x) => x.id === match.id) ?? match : null; // keep it live
  return (
    <Dialog open={!!m} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        {m && (
          <>
            <DialogHeader>
              <DialogTitle>
                Game {m.number} · {m.roundLabel}
              </DialogTitle>
              <DialogDescription>
                {m.status === 'done' ? 'Final score' : m.status === 'live' ? 'Being played now' : 'Not played yet'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(['a', 'b'] as const).map((side) => {
                const t = teamById(view, m[side].teamId);
                const sc = side === 'a' ? m.scoreA : m.scoreB;
                const won = m.status === 'done' && m.winnerTeamId === t?.id;
                return (
                  <div key={side} className={cn('flex items-center justify-between rounded-xl border-2 p-3', won ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200')}>
                    <div className="min-w-0">
                      {t ? (
                        <>
                          <p className="font-semibold text-slate-800">{t.male.name}</p>
                          <p className="font-semibold text-slate-800">{t.female.name}</p>
                        </>
                      ) : (
                        <p className="italic text-slate-500">{m[side].placeholder}</p>
                      )}
                    </div>
                    {(m.status === 'done' || m.status === 'live') && (
                      <span className="font-mono text-3xl font-bold tabular-nums text-slate-800">{sc ?? 0}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
