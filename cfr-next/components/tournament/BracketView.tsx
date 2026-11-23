'use client';

import { useMemo } from 'react';
import type { TournamentView, ViewMatch } from '@/lib/tournament/view';
import { MatchCard } from './ui';

// Fixed geometry: positions come from (round, position) only, so a score update never moves anything.
const CARD_H = 100;
const GAP_Y = 14;
const UNIT = CARD_H + GAP_Y;
const COL_W = 212;
const GAP_X = 36;

export default function BracketView({
  view,
  matches,
  onOpen,
}: {
  view: Pick<TournamentView, 'teams'>;
  matches: ViewMatch[];
  onOpen?: (m: ViewMatch) => void;
}) {
  const rounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 0;
  const firstRound = matches.filter((m) => m.round === 1).length;
  const height = Math.max(1, firstRound) * UNIT;
  const width = rounds * COL_W + (rounds - 1) * GAP_X;

  const pos = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    for (const m of matches) {
      const span = 2 ** (m.round - 1);
      out.set(m.id, { x: (m.round - 1) * (COL_W + GAP_X), y: UNIT * span * (m.position + 0.5) - CARD_H / 2 });
    }
    return out;
  }, [matches]);

  const lines = useMemo(
    () =>
      matches
        .filter((m) => m.next)
        .map((m) => {
          const a = pos.get(m.id)!;
          const b = pos.get(m.next!.matchId)!;
          const x1 = a.x + COL_W;
          const y1 = a.y + CARD_H / 2;
          const x2 = b.x;
          const y2 = b.y + CARD_H / 2;
          const mid = x1 + GAP_X / 2;
          const decided = m.status === 'done' || (m.status === 'bye' && !!m.winnerTeamId);
          return { id: m.id, d: `M${x1} ${y1} H${mid} V${y2} H${x2}`, decided };
        }),
    [matches, pos]
  );

  if (!matches.length) return null;
  const labels = Array.from({ length: rounds }, (_, i) => matches.find((m) => m.round === i + 1)?.roundLabel ?? `Round ${i + 1}`);

  return (
    <div
      className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-4 [scrollbar-width:thin] snap-x snap-mandatory sm:snap-none"
      role="region"
      aria-label="Tournament bracket. Scroll sideways to see later rounds."
      tabIndex={0}
    >
      <div className="relative mx-auto" style={{ width, minWidth: width }}>
        <div className="sticky top-0 z-10 flex bg-slate-50/95 pb-2 backdrop-blur" style={{ gap: GAP_X }}>
          {labels.map((l, i) => (
            <div key={i} className="snap-start text-center text-xs font-bold uppercase tracking-wider text-slate-500" style={{ width: COL_W }}>
              {l}
            </div>
          ))}
        </div>
        <div className="relative" style={{ height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {lines.map((l) => (
              <path
                key={l.id}
                d={l.d}
                fill="none"
                strokeWidth={2}
                className={l.decided ? 'stroke-slate-400' : 'stroke-slate-200'}
              />
            ))}
          </svg>
          {matches.map((m) => {
            const p = pos.get(m.id)!;
            return (
              <div key={m.id} className="absolute snap-start" style={{ left: p.x, top: p.y, width: COL_W, height: CARD_H }}>
                <MatchCard view={view} m={m} onOpen={onOpen} dense className="h-full" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
