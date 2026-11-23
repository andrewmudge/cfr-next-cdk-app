'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, History, Loader2, Minus, Pencil, Plus, Sparkles, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { currentReunionYear } from '@/lib/reunion-config';
import { CommandError, sendCommand, useTournament, useYearParam, withYear } from '@/lib/tournament/client';
import type { GameId } from '@/lib/tournament/types';
import type { TournamentView, ViewMatch, ViewTeam, ViewWildcard } from '@/lib/tournament/view';
import { LiveIndicator, MatchStatusLabel, Skeleton, genderWord, teamById } from './ui';

/** Wildcards this game is waiting on: directly in a slot, or via a bye that holds one. */
function pendingWildcards(view: TournamentView, m: ViewMatch): ViewWildcard[] {
  const ids = new Set<string>();
  for (const side of ['a', 'b'] as const) {
    const sl = m[side];
    if (sl.teamId) continue;
    if (sl.kind === 'wildcard' && sl.wildcardId) ids.add(sl.wildcardId);
    if (sl.kind === 'match') {
      const feeder = view.matches.find((x) => x.next?.matchId === m.id && x.next.slot === side);
      if (feeder?.status === 'bye') for (const s of [feeder.a, feeder.b]) if (s.kind === 'wildcard' && s.wildcardId && !s.teamId) ids.add(s.wildcardId);
    }
  }
  return view.wildcards.filter((w) => ids.has(w.id) && !w.teamId);
}

export default function MatchControl({ game, matchId }: { game: GameId; matchId: string }) {
  const yearParam = useYearParam();
  const year = yearParam ?? currentReunionYear();
  const { view, role, status, accept } = useTournament(game, yearParam);
  const m = view?.matches.find((x) => x.id === matchId);
  const back = withYear(`/tournament/${game}`, yearParam);

  if (!view) {
    return (
      <Shell back={back} status={status}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </Shell>
    );
  }
  if (role === 'spectator') {
    return (
      <Shell back={back} status={status}>
        <p className="rounded-2xl bg-white p-6 text-center text-slate-700 shadow">
          Only the tournament manager can score games. Go back and tap <strong>Manage</strong> to sign in.
        </p>
      </Shell>
    );
  }
  if (!m) {
    return (
      <Shell back={back} status={status}>
        <p className="rounded-2xl bg-white p-6 text-center text-slate-700 shadow">That game was not found.</p>
      </Shell>
    );
  }
  return (
    <Shell back={back} status={status}>
      <Control key={m.id} view={view} m={m} game={game} year={year} role={role} accept={accept} />
    </Shell>
  );
}

function Shell({ back, status, children }: { back: string; status: Parameters<typeof LiveIndicator>[0]['status']; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg space-y-4 px-4 pb-16 pt-4">
        <div className="flex items-center justify-between">
          <Link href={back} className="inline-flex min-h-[44px] items-center text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="mr-1 h-4 w-4" /> All games
          </Link>
          <LiveIndicator status={status} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Control({
  view,
  m,
  game,
  year,
  role,
  accept,
}: {
  view: TournamentView;
  m: ViewMatch;
  game: GameId;
  year: string;
  role: 'manager' | 'admin' | 'spectator';
  accept: ReturnType<typeof useTournament>['accept'];
}) {
  const [a, setA] = useState(m.scoreA ?? 0);
  const [b, setB] = useState(m.scoreB ?? 0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [rollbackAsk, setRollbackAsk] = useState(false);
  const lastVersion = useRef(m.version);

  // Someone else changed the score (another manager, or our own save came back): follow it unless we're mid-edit.
  useEffect(() => {
    if (m.version !== lastVersion.current) {
      lastVersion.current = m.version;
      if (!dirty) {
        setA(m.scoreA ?? 0);
        setB(m.scoreB ?? 0);
      }
    }
  }, [m.version, m.scoreA, m.scoreB, dirty]);

  const teamA = teamById(view, m.a.teamId);
  const teamB = teamById(view, m.b.teamId);
  const paused = view.status === 'PAUSED';
  const finished = view.status === 'COMPLETED';
  const wildcards = pendingWildcards(view, m);

  const run = async (label: string, command: Record<string, unknown> & { type: string }, opts: { version?: boolean } = {}) => {
    setBusy(label);
    try {
      const r = await sendCommand(game, year, command, opts.version ? m.version : undefined);
      accept(r.view, r.role);
      return true;
    } catch (e) {
      const err = e as CommandError;
      if (err.code === 'conflict' && command.type === 'correctMatch' && role === 'admin' && !command.rollback) {
        setRollbackAsk(true);
      } else toast.error(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Save in-progress scores a moment after the last tap, so spectators see them live.
  useEffect(() => {
    if (!dirty || m.status !== 'live') return;
    const t = setTimeout(async () => {
      const ok = await run('save', { type: 'saveScore', matchId: m.id, scoreA: a, scoreB: b }, { version: true });
      if (ok) setDirty(false);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, dirty, m.status]);

  const bump = (side: 'a' | 'b', d: number) => {
    setDirty(true);
    if (side === 'a') setA((v) => Math.max(0, Math.min(999, v + d)));
    else setB((v) => Math.max(0, Math.min(999, v + d)));
  };

  const winner = a === b ? null : a > b ? teamA : teamB;
  const editable = m.status === 'live' || fixing;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-slate-500">
          {view.emoji} {view.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-800">
            Game {m.number} · {m.roundLabel}
          </h1>
          <span className="text-sm">
            <MatchStatusLabel m={m} />
          </span>
        </div>
        <p className="text-sm text-slate-500">Games to {view.targetScore}. You decide when it&apos;s over.</p>
      </header>

      {paused && <p className="rounded-xl bg-slate-200 p-3 text-center text-sm font-medium text-slate-700">The tournament is paused.</p>}

      {wildcards.map((w) => (
        <WildcardPicker key={w.id} w={w} busy={busy} onPick={(pid) => run('wild', { type: 'fillWildcard', wildcardId: w.id, personId: pid })} onDecline={(pid) => run('decline', { type: 'declineWildcard', wildcardId: w.id, personId: pid })} />
      ))}

      {(['a', 'b'] as const).map((side) => {
        const team = side === 'a' ? teamA : teamB;
        const score = side === 'a' ? a : b;
        const won = m.status === 'done' && !fixing && m.winnerTeamId && m.winnerTeamId === team?.id;
        return (
          <section key={side} className={cn('rounded-2xl border-2 bg-white p-4 shadow-sm', won ? 'border-emerald-400' : 'border-slate-200')} aria-label={team?.label ?? 'Open slot'}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {team ? (
                  <>
                    <p className="text-lg font-bold text-slate-800">{team.male.name}</p>
                    <p className="text-lg font-bold text-slate-800">{team.female.name}</p>
                    {team.wildcardId && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <Sparkles className="h-3 w-3" /> Wildcard team
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-lg italic text-slate-400">{m[side].placeholder}</p>
                )}
              </div>
              {won && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                  <Check className="h-3.5 w-3.5" /> Won
                </span>
              )}
            </div>
            {team && (m.status === 'live' || m.status === 'done') && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label={`One less point for ${team.label}`}
                  disabled={!editable || score === 0 || paused}
                  onClick={() => bump(side, -1)}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-slate-300 text-slate-700 active:bg-slate-100 disabled:opacity-30"
                >
                  <Minus className="h-8 w-8" />
                </button>
                <span className="min-w-[3ch] text-center font-mono text-6xl font-bold tabular-nums text-slate-900" aria-live="polite">
                  {score}
                </span>
                <button
                  type="button"
                  aria-label={`One more point for ${team.label}`}
                  disabled={!editable || paused}
                  onClick={() => bump(side, 1)}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-white active:bg-red-700 disabled:opacity-30"
                >
                  <Plus className="h-8 w-8" />
                </button>
              </div>
            )}
            {team && m.status === 'ready' && <TeamSub view={view} team={team} busy={busy} disabled={paused} onSub={(out, inn) => run('sub', { type: 'substitute', teamId: team.id, outPersonId: out, inPersonId: inn })} />}
          </section>
        );
      })}

      {/* Actions */}
      <div className="space-y-2">
        {m.status === 'ready' && (
          <Button
            className="w-full min-h-[60px] bg-red-600 text-lg hover:bg-red-700"
            disabled={!!busy || paused}
            onClick={() => run('start', { type: 'startMatch', matchId: m.id }, { version: true })}
          >
            {busy === 'start' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Start game'}
          </Button>
        )}
        {m.status === 'live' && (
          <>
            <p className="h-5 text-center text-sm text-slate-500" aria-live="polite">
              {busy === 'save' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
            </p>
            <Button
              className="w-full min-h-[60px] bg-slate-900 text-lg hover:bg-slate-800"
              disabled={!!busy || paused || a === b}
              onClick={() => setConfirmFinish(true)}
            >
              Finish game
            </Button>
            {a === b && <p className="text-center text-sm text-slate-500">Games can&apos;t end in a tie.</p>}
          </>
        )}
        {m.status === 'done' && !fixing && (
          <Button variant="outline" className="w-full min-h-[52px]" disabled={finished && role !== 'admin'} onClick={() => setFixing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Fix result
          </Button>
        )}
        {m.status === 'done' && fixing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-[52px] flex-1"
              onClick={() => {
                setFixing(false);
                setDirty(false);
                setA(m.scoreA ?? 0);
                setB(m.scoreB ?? 0);
              }}
            >
              Cancel
            </Button>
            <Button
              className="min-h-[52px] flex-[2] bg-red-600 hover:bg-red-700"
              disabled={!!busy || a === b}
              onClick={async () => {
                if (await run('fix', { type: 'correctMatch', matchId: m.id, scoreA: a, scoreB: b }, { version: true })) {
                  setFixing(false);
                  setDirty(false);
                  toast.success('Result fixed.');
                }
              }}
            >
              {busy === 'fix' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save fixed result'}
            </Button>
          </div>
        )}
        {m.status === 'pending' && !wildcards.length && (
          <p className="rounded-xl bg-white p-4 text-center text-slate-600 shadow-sm">This game is waiting for an earlier game to finish.</p>
        )}
        {finished && role !== 'admin' && <p className="text-center text-sm text-slate-500">The tournament is finished. Only an admin can change results.</p>}
      </div>

      {m.history.length > 0 && (
        <details className="rounded-xl bg-white p-3 shadow-sm">
          <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <History className="h-4 w-4" /> Score history
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {[...m.history].reverse().map((h, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {h.scoreA}–{h.scoreB} {h.note && <span className="text-slate-400">({h.note})</span>}
                </span>
                <span className="text-slate-400">{new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Finish this game?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              <strong className="text-slate-900">{winner?.label}</strong> win {Math.max(a, b)}–{Math.min(a, b)}. They move on to their next game.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-[48px]">Keep playing</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[48px] bg-red-600 hover:bg-red-700"
              disabled={!!busy}
              onClick={async (e) => {
                e.preventDefault();
                if (await run('finish', { type: 'completeMatch', matchId: m.id, scoreA: a, scoreB: b })) {
                  setDirty(false);
                  setConfirmFinish(false);
                  toast.success(`${winner?.label} win!`);
                }
              }}
            >
              {busy === 'finish' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, finish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rollbackAsk} onOpenChange={setRollbackAsk}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back later games?</AlertDialogTitle>
            <AlertDialogDescription>
              The old winner has already played their next game. Changing this result will reset that game (and anything after it) so it can be
              replayed with the right team. This is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-[48px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[48px] bg-red-600 hover:bg-red-700"
              onClick={async (e) => {
                e.preventDefault();
                if (await run('fix', { type: 'correctMatch', matchId: m.id, scoreA: a, scoreB: b, rollback: true })) {
                  setRollbackAsk(false);
                  setFixing(false);
                  setDirty(false);
                  toast.success('Result fixed and later games reset.');
                }
              }}
            >
              Roll back and fix
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WildcardPicker({
  w,
  busy,
  onPick,
  onDecline,
}: {
  w: ViewWildcard;
  busy: string | null;
  onPick: (personId: string) => void;
  onDecline: (personId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const list = w.candidates ?? [];
  const first = list[0];
  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 font-bold text-amber-900">
        <Sparkles className="h-5 w-5" /> Wildcard teammate for {w.waiting.name}
      </p>
      {!first ? (
        <p className="mt-2 text-sm text-amber-900">
          Nobody is available yet. The first {genderWord(w.neededGender)} to lose a game will be offered this spot.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-amber-900">
            {first.why === 'loser' ? `First ${genderWord(w.neededGender)} knocked out:` : 'Available alternate:'}
          </p>
          <p className="text-xl font-bold text-amber-950">{first.name}</p>
          <div className="mt-3 flex gap-2">
            <Button className="min-h-[52px] flex-[2] bg-amber-600 text-base hover:bg-amber-700" disabled={!!busy} onClick={() => onPick(first.personId)}>
              {busy === 'wild' ? <Loader2 className="h-5 w-5 animate-spin" /> : `${first.name.split(' ')[0]} is in`}
            </Button>
            <Button variant="outline" className="min-h-[52px] flex-1 border-amber-300 bg-white" disabled={!!busy} onClick={() => onDecline(first.personId)}>
              Declined
            </Button>
          </div>
          {list.length > 1 && (
            <div className="mt-3">
              <button type="button" className="min-h-[44px] text-sm font-medium text-amber-900 underline underline-offset-4" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Hide others' : `Pick someone else (${list.length - 1})`}
              </button>
              {showAll && (
                <ul className="mt-1 space-y-1">
                  {list.slice(1).map((c) => (
                    <li key={c.personId}>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => onPick(c.personId)}
                        className="flex min-h-[48px] w-full items-center justify-between rounded-xl bg-white px-3 text-left text-slate-800 shadow-sm hover:bg-amber-100"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-slate-500">{c.why === 'loser' ? 'knocked out' : 'alternate'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {w.declined.length > 0 && <p className="mt-2 text-xs text-amber-800">Declined: {w.declined.length}</p>}
    </section>
  );
}

function TeamSub({
  view,
  team,
  busy,
  disabled,
  onSub,
}: {
  view: TournamentView;
  team: ViewTeam;
  busy: string | null;
  disabled: boolean;
  onSub: (outId: string, inId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState<string>('');
  const outP = [team.male, team.female].find((p) => p.personId === out);
  const options = useMemo(() => (view.bench ?? []).filter((p) => outP && p.gender === outP.gender), [view.bench, outP]);
  if (!view.bench) return null;
  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          title={disabled ? 'Finish the game before swapping players' : undefined}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500 underline-offset-4 hover:underline disabled:opacity-40"
        >
          <UserRoundCog className="h-4 w-4" /> Swap a player
        </button>
      ) : (
        <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Who&apos;s leaving?</p>
          <div className="flex gap-2">
            {[team.male, team.female].map((p) => (
              <button
                key={p.personId}
                type="button"
                onClick={() => setOut(p.personId)}
                className={cn('min-h-[44px] flex-1 rounded-lg border-2 px-2 text-sm', out === p.personId ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white')}
              >
                {p.name}
              </button>
            ))}
          </div>
          {outP && (
            <>
              <p className="text-sm font-medium text-slate-700">Who&apos;s taking their place?</p>
              {options.length === 0 ? (
                <p className="text-sm text-slate-500">No free {genderWord(outP.gender)} available.</p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {options.map((p) => (
                    <li key={p.personId}>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => {
                          onSub(outP.personId, p.personId);
                          setOpen(false);
                          setOut('');
                        }}
                        className="min-h-[44px] w-full rounded-lg bg-white px-3 text-left text-sm shadow-sm hover:bg-slate-100"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button type="button" className="min-h-[44px] text-sm text-slate-500 underline" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
