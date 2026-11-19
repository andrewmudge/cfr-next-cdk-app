'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FamilyGraph } from '@/lib/family-tree/graph';
import { Avatar, lifeYears } from './PersonCard';

interface Props {
  g: FamilyGraph;
  coming: Set<string>;
  highlight: Set<string>;
  /** Person to reveal (opens their branch and scrolls to them). */
  revealId: string | null;
  onSelect: (id: string) => void;
}

/** Collapsible outline of the family: each person with their partner(s), children nested below. */
export default function BranchList({ g, coming, highlight, revealId, onSelect }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([g.rootId]));

  useEffect(() => {
    if (!revealId) return;
    // Open every ancestor on the way down from the root so the person is visible.
    const top = (id: string) => g.lineToTop(id).at(-1);
    // People who married in are shown next to their partner, so open the partner's line.
    const target = top(revealId) === g.rootId ? revealId : g.partnersOf(revealId).find((p) => top(p) === g.rootId);
    if (!target) return;
    setOpen((s) => new Set([...s, ...g.lineToTop(target)]));
    setTimeout(() => document.getElementById(`ftlist-${revealId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, [revealId, g]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderName = (id: string) => (
    <button
      type="button"
      id={`ftlist-${id}`}
      onClick={() => onSelect(id)}
      className={cn(
        'flex min-h-[44px] items-center gap-2 rounded-xl px-1.5 text-left hover:bg-slate-100',
        (highlight.has(id) || revealId === id) && 'bg-red-50 ring-2 ring-red-300'
      )}
    >
      <Avatar g={g} id={id} size={32} />
      <span className="leading-tight">
        <span className={cn('block text-[15px] font-medium', g.get(id)?.deceased ? 'text-slate-500' : 'text-slate-800')}>
          {g.name(id)}
          {coming.has(id) && <CheckCircle2 className="ml-1 inline h-4 w-4 text-green-600" aria-label="coming" />}
        </span>
        {(g.get(id)?.nickname || g.get(id)?.deceased) && (
          <span className="block text-xs text-slate-400">
            {g.get(id)?.nickname ? `“${g.get(id)?.nickname}”` : lifeYears(g, id) || 'In memory'}
          </span>
        )}
      </span>
    </button>
  );

  const renderUnit = (id: string, seen: Set<string>): ReactNode => {
    const kids = g.childrenOf(id).filter((k) => !seen.has(k));
    const isOpen = open.has(id);
    const next = new Set([...seen, id, ...kids]);
    return (
      <li key={id}>
        <div className="flex flex-wrap items-center gap-x-1">
          {kids.length ? (
            <button
              type="button"
              onClick={() => toggle(id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Hide' : 'Show'} ${g.name(id)}'s children`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <ChevronRight className={cn('h-5 w-5 transition-transform', isOpen && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-9" />
          )}
          {renderName(id)}
          {g.partnersOf(id).map((p) => (
            <span key={p} className="flex items-center">
              <span className="px-1 text-slate-300">&amp;</span>
              {renderName(p)}
            </span>
          ))}
          {kids.length > 0 && !isOpen && <span className="text-xs text-slate-400">{kids.length} {kids.length === 1 ? 'child' : 'children'}</span>}
        </div>
        {isOpen && kids.length > 0 && (
          <ul className="ml-[18px] border-l-2 border-slate-100 pl-2">
            {kids.map((k) => renderUnit(k, next))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul className="space-y-1 p-2 sm:p-4">
      {renderUnit(g.rootId, new Set([g.rootId]))}
    </ul>
  );
}
