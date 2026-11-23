'use client';

import { Check, Loader2, Sparkles, Trophy, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveStatus } from '@/lib/tournament/client';
import type { TournamentStatus } from '@/lib/tournament/types';
import type { TournamentView, ViewMatch, ViewSlot, ViewTeam } from '@/lib/tournament/view';

export const STATUS_LABEL: Record<TournamentStatus | 'NONE', string> = {
  NONE: 'Not set up yet',
  DRAFT: 'Coming soon',
  READY: 'Bracket is set',
  IN_PROGRESS: 'Playing now',
  PAUSED: 'Paused',
  COMPLETED: 'Finished',
  CANCELLED: 'Cancelled',
};

export function StatusPill({ status, className }: { status: TournamentStatus | 'NONE'; className?: string }) {
  const tone =
    status === 'IN_PROGRESS'
      ? 'bg-red-600 text-white'
      : status === 'COMPLETED'
        ? 'bg-amber-100 text-amber-900'
        : status === 'READY'
          ? 'bg-emerald-100 text-emerald-900'
          : status === 'PAUSED'
            ? 'bg-slate-200 text-slate-800'
            : 'bg-slate-100 text-slate-600';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', tone, className)}>
      {status === 'IN_PROGRESS' && <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LiveIndicator({ status }: { status: LiveStatus }) {
  if (status === 'loading') return null;
  const map = {
    live: { text: 'Live', cls: 'text-emerald-700', dot: 'bg-emerald-500' },
    reconnecting: { text: 'Reconnecting…', cls: 'text-amber-700', dot: 'bg-amber-500' },
    offline: { text: 'Offline', cls: 'text-slate-500', dot: 'bg-slate-400' },
  }[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', map.cls)} role="status" aria-live="polite">
      {status === 'offline' ? (
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
      ) : status === 'reconnecting' ? (
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
      ) : (
        <span className={cn('h-2 w-2 rounded-full motion-safe:animate-pulse', map.dot)} aria-hidden />
      )}
      {map.text}
    </span>
  );
}

export const teamById = (v: Pick<TournamentView, 'teams'>, id?: string) => (id ? v.teams.find((t) => t.id === id) : undefined);

/** One side of a game: team name (or placeholder) and score. Fixed height so live updates never shift layout. */
export function SlotRow({
  view,
  match,
  slot,
  score,
  dense,
}: {
  view: Pick<TournamentView, 'teams'>;
  match: ViewMatch;
  slot: ViewSlot;
  score?: number;
  dense?: boolean;
}) {
  const team = teamById(view, slot.teamId);
  const won = match.status === 'done' && match.winnerTeamId && match.winnerTeamId === slot.teamId;
  const lost = match.status === 'done' && match.loserTeamId && match.loserTeamId === slot.teamId;
  const showScore = match.status === 'live' || match.status === 'done';
  return (
    <div className={cn('flex items-center justify-between gap-2', dense ? 'h-8' : 'h-10')}>
      <span
        className={cn(
          'min-w-0 truncate',
          dense ? 'text-sm' : 'text-base',
          team ? 'text-slate-800' : 'italic text-slate-400',
          won && 'font-bold text-slate-900',
          lost && 'text-slate-400 line-through decoration-slate-300'
        )}
        title={team ? `${team.male.name} & ${team.female.name}` : slot.placeholder}
      >
        {team ? team.label : slot.placeholder}
        {team?.wildcardId && <Sparkles className="ml-1 inline h-3.5 w-3.5 text-amber-500" aria-label="Wildcard team" />}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {won && <Check className="h-4 w-4 text-emerald-600" aria-label="Winner" />}
        {showScore && (
          <span className={cn('w-8 text-right font-mono tabular-nums', dense ? 'text-base' : 'text-lg', won ? 'font-bold text-slate-900' : 'text-slate-600')}>
            {score ?? 0}
          </span>
        )}
      </span>
    </div>
  );
}

export const matchTone = (m: ViewMatch) =>
  m.status === 'live'
    ? 'border-red-500 ring-2 ring-red-200'
    : m.status === 'ready'
      ? 'border-slate-300'
      : m.status === 'done'
        ? 'border-slate-200'
        : m.status === 'bye'
          ? 'border-dashed border-slate-200 bg-slate-50'
          : 'border-dashed border-slate-300';

export function MatchStatusLabel({ m }: { m: ViewMatch }) {
  if (m.status === 'live')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600 motion-safe:animate-pulse" aria-hidden /> Live
      </span>
    );
  if (m.status === 'done') return <span className="text-slate-500">Final</span>;
  if (m.status === 'ready') return <span className="font-medium text-emerald-700">Up next</span>;
  if (m.status === 'bye') return <span className="text-slate-400">Bye</span>;
  const wild = m.a.kind === 'wildcard' || m.b.kind === 'wildcard';
  return <span className={wild ? 'text-amber-700' : 'text-slate-400'}>{wild ? 'Waiting for wildcard' : 'Waiting'}</span>;
}

/** Compact game card used in the bracket and the match list. */
export function MatchCard({
  view,
  m,
  onOpen,
  dense,
  className,
}: {
  view: Pick<TournamentView, 'teams'>;
  m: ViewMatch;
  onOpen?: (m: ViewMatch) => void;
  dense?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
        <span className="font-semibold text-slate-500">{m.status === 'bye' ? m.roundLabel : `Game ${m.number}`}</span>
        <MatchStatusLabel m={m} />
      </div>
      {m.status === 'bye' ? (
        <div className={cn('flex items-center text-slate-500', dense ? 'h-16 text-sm' : 'h-20')}>
          <span className="truncate">
            {teamById(view, m.winnerTeamId)?.label ?? m.a.placeholder ?? m.b.placeholder ?? 'TBD'}{' '}
            <span className="text-slate-400">moves on</span>
          </span>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          <SlotRow view={view} match={m} slot={m.a} score={m.scoreA} dense={dense} />
          <SlotRow view={view} match={m} slot={m.b} score={m.scoreB} dense={dense} />
        </div>
      )}
    </>
  );
  const cls = cn('block w-full rounded-xl border-2 bg-white px-3 py-2 text-left shadow-sm', matchTone(m), className);
  if (!onOpen || m.status === 'bye') return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(m)}
      className={cn(cls, 'transition-colors hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400')}
      aria-label={`Game ${m.number}, ${m.roundLabel}`}
    >
      {body}
    </button>
  );
}

export function ChampionBanner({ team, gameLabel }: { team: ViewTeam; gameLabel: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-400 via-amber-300 to-yellow-200 p-5 text-center shadow-lg">
      <Trophy className="mx-auto h-10 w-10 text-amber-900" aria-hidden />
      <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-amber-900/80">{gameLabel} champions</p>
      <p className="mt-1 text-2xl font-bold text-amber-950">
        {team.male.name} &amp; {team.female.name}
      </p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-xl bg-slate-200/70 motion-safe:animate-pulse', className)} />;
}

export const genderWord = (g: 'M' | 'F') => (g === 'M' ? 'man' : 'woman');
