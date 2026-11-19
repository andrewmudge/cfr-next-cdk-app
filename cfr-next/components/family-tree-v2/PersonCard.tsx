'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FamilyGraph } from '@/lib/family-tree/graph';

// Each child of Patrick & Ollie starts a branch with its own color.
export const BRANCH_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
export const ROOT_COLOR = '#a16207';
export const MARRIED_IN_COLOR = '#94a3b8';

export function personColor(g: FamilyGraph, id: string) {
  if (g.isRootCouple(id)) return ROOT_COLOR;
  const b = g.branchOf(id);
  return b === undefined ? MARRIED_IN_COLOR : BRANCH_COLORS[b % BRANCH_COLORS.length];
}

export function initials(g: FamilyGraph, id: string) {
  const p = g.get(id);
  if (!p) return '?';
  return `${p.given[0] ?? ''}${p.family[0] ?? ''}`.toUpperCase();
}

export function lifeYears(g: FamilyGraph, id: string) {
  const p = g.get(id);
  if (!p?.deceased) return '';
  if (p.born && p.died) return `${p.born} – ${p.died}`;
  if (p.born) return `${p.born} – `;
  if (p.died) return `d. ${p.died}`;
  return '';
}

export function Avatar({ g, id, size = 40 }: { g: FamilyGraph; id: string; size?: number }) {
  const color = personColor(g, id);
  const deceased = g.get(id)?.deceased;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', deceased && 'opacity-70')}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color,
        background: `${color}14`,
        boxShadow: `inset 0 0 0 2.5px ${color}`,
      }}
      aria-hidden
    >
      {initials(g, id)}
    </span>
  );
}

interface CardProps {
  g: FamilyGraph;
  id: string;
  focused?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  coming?: boolean;
  onClick?: () => void;
}

export default function PersonCard({ g, id, focused, highlighted, dimmed, coming, onClick }: CardProps) {
  const p = g.get(id);
  if (!p) return null;
  const years = lifeYears(g, id);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${g.name(id)}${p.deceased ? ', in memory' : ''}${coming ? ', coming to the reunion' : ''}`}
      className={cn(
        'group relative flex h-full w-full items-center gap-2.5 rounded-2xl border bg-white px-3 text-left shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200',
        p.deceased && 'bg-slate-50',
        focused ? 'border-slate-800 ring-2 ring-slate-800/80' : 'border-slate-200',
        highlighted && !focused && 'border-red-500 ring-2 ring-red-400',
        dimmed && 'opacity-35'
      )}
    >
      <Avatar g={g} id={id} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn('block truncate text-[13px] font-semibold', p.deceased ? 'text-slate-500' : 'text-slate-800')}>
          {p.given}
        </span>
        <span className="block truncate text-[12px] text-slate-500">{p.family}</span>
        {p.nickname ? (
          <span className="block truncate text-[11px] italic text-slate-400">“{p.nickname}”</span>
        ) : p.deceased ? (
          <span className="block truncate text-[11px] text-slate-400">{years || 'In memory'}</span>
        ) : null}
      </span>
      {coming && (
        <CheckCircle2 className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-white text-green-600" aria-hidden />
      )}
    </button>
  );
}
