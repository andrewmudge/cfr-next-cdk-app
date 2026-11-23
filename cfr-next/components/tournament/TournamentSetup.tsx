'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Download, Eye, Loader2, Lock, Pause, Play, RotateCcw, Shuffle, Sparkles, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { currentReunionYear, searchPeople, type PublicPerson } from '@/lib/reunion-config';
import { useAuth } from '@/lib/auth/AuthContext';
import { CommandError, sendCommand, useTournament, useYearParam, withYear } from '@/lib/tournament/client';
import type { GameId, Gender, TournamentEvent } from '@/lib/tournament/types';
import type { ViewParticipant } from '@/lib/tournament/view';
import BracketView from './BracketView';
import { Skeleton, StatusPill } from './ui';

const card = 'rounded-2xl bg-white p-4 sm:p-6 shadow-sm space-y-3';
const h2 = 'text-lg font-bold text-slate-800';

export default function TournamentSetup({ game }: { game: GameId }) {
  const yearParam = useYearParam();
  const year = yearParam ?? currentReunionYear();
  const { user, loading: authLoading } = useAuth();
  const { view, role, status, missing, accept, refresh } = useTournament(game, yearParam);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const run = useCallback(
    async (label: string, command: Record<string, unknown> & { type: string }, success?: string) => {
      setBusy(label);
      try {
        const r = await sendCommand(game, year, command);
        accept(r.view, r.role);
        if (success) toast.success(success);
        return true;
      } catch (e) {
        toast.error((e as CommandError).message);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [game, year, accept]
  );

  const back = withYear(`/tournament/${game}`, yearParam);
  if (!view && !missing) {
    return (
      <Page back={back}>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </Page>
    );
  }
  if (role !== 'admin') {
    return (
      <Page back={back}>
        <div className={card}>
          <p className="text-slate-700">
            {authLoading ? 'Checking your sign-in…' : user ? 'Only site admins can set up tournaments.' : 'Sign in with your admin account on the main site first.'}
          </p>
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link href="/">Go to churchwellreunion.com</Link>
          </Button>
        </div>
      </Page>
    );
  }

  const s = view?.setup;
  const draft = !view || view.status === 'DRAFT';
  const plan = s?.plan;
  const participants = s?.participants ?? [];
  const byId = new Map(participants.map((p) => [p.personId, p]));
  const teamsFormed = (view?.teams.length ?? 0) > 0;

  const tapPlayer = (pid: string) => {
    if (!draft) return;
    if (!selected) return setSelected(pid);
    if (selected === pid) return setSelected(null);
    const a = byId.get(selected);
    const b = byId.get(pid);
    if (a?.gender !== b?.gender) {
      toast.info('Pick someone of the same gender to swap with, so teams stay mixed.');
      return setSelected(pid);
    }
    run('swap', { type: 'swapPlayers', personA: selected, personB: pid }, `Swapped ${a?.name.split(' ')[0]} and ${b?.name.split(' ')[0]}.`);
    setSelected(null);
  };

  const pending = plan ? (s?.extras.length ?? 0) - plan.wildcards.length : 0;

  return (
    <Page back={back}>
      <header>
        <p className="text-sm font-medium text-slate-500">Admin · tournament setup</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold text-slate-800">
            {view?.emoji ?? ''} {view?.gameLabel ?? game} {year}
          </h1>
          <StatusPill status={view?.status ?? 'NONE'} />
          <span className="text-xs text-slate-500">{status === 'live' ? '' : status}</span>
        </div>
        {Number(year) > Number(currentReunionYear()) + 1 && (
          <p className="mt-2 rounded-lg bg-indigo-50 p-2 text-sm text-indigo-900">
            Practice year. Nothing here affects the real {currentReunionYear()} tournament. Delete it when you&apos;re done.
          </p>
        )}
      </header>

      {/* 1. Players */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>1. Players</h2>
          {draft && (
            <Button variant="outline" className="min-h-[44px]" disabled={!!busy} onClick={() => run('import', { type: 'importSignups' }, 'Sign-ups imported.')}>
              {busy === 'import' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Import {year} {view?.gameLabel ?? game} sign-ups
            </Button>
          )}
        </div>
        {view && (
          <p className="text-sm text-slate-600">
            <strong>{view.counts.men}</strong> men · <strong>{view.counts.women}</strong> women
            {view.counts.needsReview > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">{view.counts.needsReview} need a gender</span>
            )}
          </p>
        )}
        {participants.length === 0 ? (
          <p className="text-sm text-slate-500">No players yet. Import sign-ups, or add people below.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {participants.map((p) => (
              <ParticipantRow key={p.personId} p={p} draft={draft} busy={!!busy} run={run} />
            ))}
          </ul>
        )}
        {draft && <AddWalkup existing={new Set(participants.map((p) => p.personId))} busy={busy} run={run} />}
      </section>

      {/* 2. Teams */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>2. Teams</h2>
          {draft && (
            <Button className="min-h-[44px] bg-red-600 hover:bg-red-700" disabled={!!busy || participants.length < 2} onClick={() => run('teams', { type: 'generateTeams' }, 'Teams made.')}>
              {busy === 'teams' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shuffle className="mr-2 h-4 w-4" />}
              {teamsFormed ? 'Remake teams' : 'Make random teams'}
            </Button>
          )}
        </div>
        {teamsFormed && draft && <p className="text-sm text-slate-500">To swap two players, tap one, then tap another of the same gender.</p>}
        {!teamsFormed ? (
          <p className="text-sm text-slate-500">Each team is one man and one woman, picked at random.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {view!.teams
              .filter((t) => !t.wildcardId)
              .map((t, i) => (
                <li key={t.id} className="rounded-xl border-2 border-slate-200 p-2">
                  <p className="px-1 text-xs font-semibold text-slate-400">Team {i + 1}</p>
                  {[t.male, t.female].map((p) => (
                    <button
                      key={p.personId}
                      type="button"
                      disabled={!draft}
                      onClick={() => tapPlayer(p.personId)}
                      className={cn(
                        'flex min-h-[44px] w-full items-center justify-between rounded-lg px-2 text-left text-slate-800',
                        selected === p.personId ? 'bg-red-50 ring-2 ring-red-400' : draft && 'hover:bg-slate-50'
                      )}
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-slate-400">{p.gender === 'M' ? 'M' : 'F'}</span>
                    </button>
                  ))}
                </li>
              ))}
          </ul>
        )}
        {teamsFormed && (s?.extras.length ?? 0) > 0 && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-amber-950">
            <p className="flex items-center gap-2 font-bold">
              <Sparkles className="h-4 w-4" /> {s!.extras.length} without a partner
            </p>
            <ul className="mt-1">
              {s!.extras.map((pid) => (
                <li key={pid}>
                  <button
                    type="button"
                    disabled={!draft}
                    onClick={() => tapPlayer(pid)}
                    className={cn('min-h-[44px] w-full rounded-lg px-2 text-left', selected === pid ? 'bg-white ring-2 ring-red-400' : 'hover:bg-amber-100')}
                  >
                    {byId.get(pid)?.name}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              {s!.extrasAsAlternates
                ? 'They sit out as alternates. A manager can sub them in, or use them for a wildcard spot.'
                : 'Each waits for a wildcard: they team up with the first player of the other gender knocked out.'}
            </p>
            {draft && (
              <button
                type="button"
                className="mt-1 min-h-[44px] text-sm font-medium underline underline-offset-4"
                disabled={!!busy}
                onClick={() => run('alt', { type: 'setExtrasAsAlternates', value: !s!.extrasAsAlternates })}
              >
                {s!.extrasAsAlternates ? 'Use wildcards instead' : 'Make them alternates instead'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. Bracket */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>3. Bracket</h2>
          {draft && teamsFormed && (
            <Button variant="outline" className="min-h-[44px]" disabled={!!busy} onClick={() => run('plan', { type: 'makePlan' })}>
              {busy === 'plan' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : plan ? <RotateCcw className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {plan ? 'Re-roll bracket' : 'Preview bracket'}
            </Button>
          )}
        </div>
        {draft && !plan && <p className="text-sm text-slate-500">Preview a random bracket. What you preview is exactly what gets published.</p>}
        {draft && plan && (
          <>
            <p className="text-sm text-slate-600">
              {plan.size}-spot bracket · {view!.counts.teams} teams
              {plan.wildcards.length > 0 && ` · ${plan.wildcards.length} wildcard ${plan.wildcards.length === 1 ? 'spot' : 'spots'}`}
              {plan.size - view!.counts.teams - plan.wildcards.length > 0 && ` · ${plan.size - view!.counts.teams - plan.wildcards.length} byes`}
            </p>
            {pending > 0 && !s!.extrasAsAlternates && (
              <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                Only {plan.wildcards.length} of {s!.extras.length} extras fit as wildcards (not enough games are played early enough). The other {pending}{' '}
                will be alternates.
              </p>
            )}
            <div className="rounded-xl bg-slate-50 pt-2">
              <BracketView view={{ teams: view!.teams }} matches={plan.matches} />
            </div>
            <Button className="w-full min-h-[52px] bg-red-600 text-base hover:bg-red-700" disabled={!!busy} onClick={() => run('publish', { type: 'publish' }, 'Bracket published. Family can see it now.')}>
              {busy === 'publish' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Publish this bracket'}
            </Button>
          </>
        )}
        {!draft && <p className="text-sm text-slate-600">Published. Teams and the bracket are locked. See it on the tournament page.</p>}
      </section>

      {/* 4. Manager + rules */}
      {view && (
        <section className={card}>
          <h2 className={h2}>4. Manager &amp; rules</h2>
          <ManagerPassword has={view.hasManagerPassword} busy={busy} run={run} />
          <TargetScore value={view.targetScore} disabled={view.status === 'COMPLETED' || view.status === 'CANCELLED'} busy={busy} run={run} />
          <LaneSetting lanes={view.lanes} laneName={view.laneName} disabled={view.status === 'COMPLETED' || view.status === 'CANCELLED'} busy={busy} run={run} />
        </section>
      )}

      {/* 5. Run */}
      {view && (
        <section className={card}>
          <h2 className={h2}>5. Run the tournament</h2>
          <div className="flex flex-wrap gap-2">
            {view.status === 'READY' && (
              <>
                <Button className="min-h-[48px] bg-red-600 hover:bg-red-700" disabled={!!busy} onClick={() => run('start', { type: 'start' }, 'Tournament started.')}>
                  <Play className="mr-2 h-4 w-4" /> Start tournament
                </Button>
                <Button variant="outline" className="min-h-[48px]" disabled={!!busy} onClick={() => run('unpublish', { type: 'unpublish' }, 'Back to draft.')}>
                  <Lock className="mr-2 h-4 w-4" /> Unpublish
                </Button>
              </>
            )}
            {view.status === 'IN_PROGRESS' && (
              <Button variant="outline" className="min-h-[48px]" disabled={!!busy} onClick={() => run('pause', { type: 'pause' }, 'Paused.')}>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </Button>
            )}
            {view.status === 'PAUSED' && (
              <Button className="min-h-[48px] bg-red-600 hover:bg-red-700" disabled={!!busy} onClick={() => run('resume', { type: 'resume' }, 'Resumed.')}>
                <Play className="mr-2 h-4 w-4" /> Resume
              </Button>
            )}
            {(view.status === 'COMPLETED' || view.status === 'CANCELLED') && (
              <Button variant="outline" className="min-h-[48px]" disabled={!!busy} onClick={() => run('reopen', { type: 'reopen' }, 'Reopened.')}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reopen
              </Button>
            )}
            {view.status !== 'CANCELLED' && view.status !== 'COMPLETED' && (
              <Button
                variant="outline"
                className="min-h-[48px] text-red-700"
                disabled={!!busy}
                onClick={() => confirm('Cancel this tournament? You can reopen it later.') && run('cancel', { type: 'cancel' }, 'Cancelled.')}
              >
                <X className="mr-2 h-4 w-4" /> Cancel tournament
              </Button>
            )}
            {(view.status === 'DRAFT' || view.status === 'CANCELLED') && (
              <DeleteButton game={game} year={year} onDone={refresh} />
            )}
          </div>
          {view.status === 'IN_PROGRESS' && (
            <p className="text-sm text-slate-600">
              Winners move on automatically. The manager scores games from the tournament page. You can fix any result there too.
            </p>
          )}
        </section>
      )}

      {view && <AuditLog game={game} year={year} version={view.version} />}
    </Page>
  );
}

function Page({ back, children }: { back: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-4">
        <Link href={back} className="inline-flex min-h-[44px] items-center text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="mr-1 h-4 w-4" /> Tournament page
        </Link>
        {children}
      </div>
    </div>
  );
}

type Run = (label: string, command: Record<string, unknown> & { type: string }, success?: string) => Promise<boolean>;

function GenderButtons({ value, onChange, disabled }: { value?: Gender; onChange: (g: Gender) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Gender">
      {(['M', 'F'] as const).map((g) => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          disabled={disabled}
          onClick={() => onChange(g)}
          className={cn(
            'min-h-[44px] min-w-[44px] rounded-lg border-2 px-2 text-sm font-semibold',
            value === g ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 bg-white text-slate-600',
            disabled && 'opacity-60'
          )}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

const STATE_TEXT: Record<ViewParticipant['state'], string> = {
  on_team: 'On a team',
  waiting: 'Waiting for wildcard',
  alternate: 'Alternate',
  eliminated: 'Knocked out',
  unassigned: '',
  excluded: 'Left out',
  needs_review: 'Needs a gender',
};

function ParticipantRow({ p, draft, busy, run }: { p: ViewParticipant; draft: boolean; busy: boolean; run: Run }) {
  return (
    <li className={cn('flex flex-wrap items-center justify-between gap-2 py-2', p.excluded && 'opacity-60')}>
      <div className="min-w-0">
        <p className="font-medium text-slate-800">{p.name}</p>
        <p className={cn('text-xs', p.needsReview ? 'font-semibold text-amber-700' : 'text-slate-500')}>
          {[p.source === 'walkup' ? 'Added by admin' : 'Signed up', STATE_TEXT[p.state]].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <GenderButtons value={p.gender} disabled={!draft || busy} onChange={(g) => run('g', { type: 'updateParticipant', personId: p.personId, gender: g })} />
        {draft && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              p.source === 'walkup'
                ? run('rm', { type: 'removeParticipant', personId: p.personId })
                : run('ex', { type: 'updateParticipant', personId: p.personId, excluded: !p.excluded })
            }
            className="min-h-[44px] rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            {p.source === 'walkup' ? 'Remove' : p.excluded ? 'Include' : 'Leave out'}
          </button>
        )}
      </div>
    </li>
  );
}

function AddWalkup({ existing, busy, run }: { existing: Set<string>; busy: string | null; run: Run }) {
  const [people, setPeople] = useState<PublicPerson[] | null>(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<PublicPerson | null>(null);
  const [gender, setGender] = useState<Gender | undefined>();
  useEffect(() => {
    fetch('/api/people', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setPeople(d.people ?? []))
      .catch(() => setPeople([]));
  }, []);
  const results = useMemo(() => (people && q.trim().length > 1 ? searchPeople(people, q, 8).filter((p) => !existing.has(p.id)) : []), [people, q, existing]);
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <UserPlus className="h-4 w-4" /> Add someone (walk-ups, or practice players)
      </p>
      {!pick ? (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a name from the family list…"
            className="mt-2 w-full min-h-[48px] rounded-xl border-2 border-slate-300 px-3 focus:border-red-500 focus:outline-none"
            aria-label="Search family list"
          />
          {results.length > 0 && (
            <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="min-h-[44px] w-full px-3 text-left hover:bg-slate-50"
                    onClick={() => {
                      setPick(p);
                      setGender(p.gender);
                    }}
                  >
                    {p.displayName} {p.hint && <span className="text-xs text-slate-400">({p.hint})</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">{pick.displayName}</span>
          <GenderButtons value={gender} onChange={setGender} />
          <Button
            className="min-h-[44px] bg-red-600 hover:bg-red-700"
            disabled={!gender || !!busy}
            onClick={async () => {
              if (await run('add', { type: 'addParticipant', personId: pick.id, gender }, `${pick.displayName} added.`)) {
                setPick(null);
                setQ('');
              }
            }}
          >
            Add
          </Button>
          <Button variant="ghost" className="min-h-[44px]" onClick={() => setPick(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function ManagerPassword({ has, busy, run }: { has: boolean; busy: string | null; run: Run }) {
  const [pw, setPw] = useState('');
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run('pw', { type: 'setManagerPassword', password: pw }, 'Manager password saved. Share it with your manager.')) setPw('');
      }}
    >
      <label htmlFor="mgr-pw" className="block text-sm font-medium text-slate-700">
        Manager password {has && <span className="font-normal text-emerald-700">(set. Saving a new one signs out other phones)</span>}
      </label>
      <div className="flex gap-2">
        <input
          id="mgr-pw"
          type="text"
          autoComplete="off"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={has ? 'New password' : 'e.g. cornhole26'}
          className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-300 px-3 focus:border-red-500 focus:outline-none"
        />
        <Button type="submit" className="min-h-[48px]" disabled={pw.length < 4 || !!busy}>
          Save
        </Button>
      </div>
      <p className="text-xs text-slate-500">Whoever has it can tap Manage on the tournament page and score games.</p>
    </form>
  );
}

function TargetScore({ value, disabled, busy, run }: { value: number; disabled: boolean; busy: string | null; run: Run }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run('target', { type: 'setTargetScore', targetScore: Number(v) }, 'Target score saved.');
      }}
    >
      <label className="block text-sm font-medium text-slate-700">
        Games are played to
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={v}
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          className="mt-1 block min-h-[48px] w-28 rounded-xl border-2 border-slate-300 px-3 text-lg focus:border-red-500 focus:outline-none"
        />
      </label>
      <Button type="submit" variant="outline" className="min-h-[48px]" disabled={disabled || !!busy || Number(v) === value}>
        Save
      </Button>
      <p className="w-full text-xs text-slate-500">Shown to players. The manager still decides when a game is over.</p>
    </form>
  );
}

function LaneSetting({ lanes, laneName, disabled, busy, run }: { lanes: number; laneName: string; disabled: boolean; busy: string | null; run: Run }) {
  const word = laneName.toLowerCase();
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700">
        {laneName}s (games played at once): <strong>{lanes}</strong>
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="min-h-[44px] min-w-[44px]" disabled={disabled || !!busy || lanes <= 1} onClick={() => run('lanes', { type: 'setLanes', lanes: lanes - 1 })} aria-label={`One less ${word}`}>
          −
        </Button>
        <Button variant="outline" className="min-h-[44px] min-w-[44px]" disabled={disabled || !!busy || lanes >= 20} onClick={() => run('lanes', { type: 'setLanes', lanes: lanes + 1 })} aria-label={`One more ${word}`}>
          +
        </Button>
      </div>
      <p className="text-xs text-slate-500">The manager can change this during play too, from the tournament page.</p>
    </div>
  );
}

function DeleteButton({ game, year, onDone }: { game: GameId; year: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="min-h-[48px] text-red-700"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Delete this tournament and its history? This cannot be undone.')) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/tournaments/${game}?year=${year}`, { method: 'DELETE' });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d.error || 'Could not delete.');
          toast.success('Deleted.');
          onDone();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="mr-2 h-4 w-4" /> Delete
    </Button>
  );
}

const EVENT_TEXT: Record<string, string> = {
  participants_imported: 'Imported sign-ups',
  participant_added: 'Added a player',
  participant_updated: 'Changed a player',
  participant_removed: 'Removed a player',
  teams_generated: 'Made teams',
  players_swapped: 'Swapped players',
  extras_mode: 'Changed how extras play',
  bracket_previewed: 'Previewed a bracket',
  target_score_set: 'Set target score',
  manager_password_set: 'Set manager password',
  published: 'Published the bracket',
  unpublished: 'Unpublished',
  started: 'Started the tournament',
  paused: 'Paused',
  resumed: 'Resumed',
  cancelled: 'Cancelled',
  reopened: 'Reopened',
  match_started: 'Started a game',
  match_moved: 'Moved a game',
  lanes_set: 'Changed the number of boards/pits',
  score_saved: 'Saved a score',
  match_completed: 'Finished a game',
  match_corrected: 'Fixed a result',
  match_rolled_back: 'Rolled back a game',
  wildcard_filled: 'Filled a wildcard',
  wildcard_declined: 'Wildcard declined',
  substitution: 'Substituted a player',
  tournament_completed: 'Tournament finished',
};

const scoreText = (after: unknown) => {
  const a = after as { scoreA?: unknown; scoreB?: unknown } | null;
  return a && typeof a === 'object' && typeof a.scoreA === 'number' && typeof a.scoreB === 'number' ? `${a.scoreA}–${a.scoreB}` : '';
};

function AuditLog({ game, year, version }: { game: GameId; year: string; version: number }) {
  const [events, setEvents] = useState<TournamentEvent[] | null>(null);
  useEffect(() => {
    fetch(`/api/tournaments/${game}/events?year=${year}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
  }, [game, year, version]);
  return (
    <section className={card}>
      <h2 className={cn(h2, 'flex items-center gap-2')}>
        <Users className="h-5 w-5" /> Activity log
      </h2>
      {!events ? (
        <Skeleton className="h-20 w-full" />
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="text-slate-700">
                {EVENT_TEXT[e.type] ?? e.type}
                {e.matchId && <span className="text-slate-400"> · {e.matchId}</span>}
                {scoreText(e.after) && <span className="text-slate-500"> · {scoreText(e.after)}</span>}
              </span>
              <span className="shrink-0 text-slate-400">
                {e.actor === 'manager' ? 'Manager' : e.actor.split('@')[0]} · {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
