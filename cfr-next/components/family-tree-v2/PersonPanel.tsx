'use client';

import { CheckCircle2, Crosshair, GitBranch, Users, X } from 'lucide-react';
import type { FamilyGraph } from '@/lib/family-tree/graph';
import { Avatar, BRANCH_COLORS, lifeYears } from './PersonCard';

interface Props {
  g: FamilyGraph;
  id: string;
  coming: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
  onCenter: (id: string) => void;
  onRelate: (id: string) => void;
  onShowLine: (id: string) => void;
}

function Chips({ g, label, ids, onPick }: { g: FamilyGraph; label: string; ids: string[]; onPick: (id: string) => void }) {
  if (!ids.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm text-slate-700 hover:border-slate-400"
          >
            <Avatar g={g} id={id} size={24} />
            {g.name(id)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PersonPanel({ g, id, coming, onClose, onPick, onCenter, onRelate, onShowLine }: Props) {
  const p = g.get(id);
  if (!p) return null;
  const branch = g.branchOf(id);
  const years = lifeYears(g, id);
  const partners = g.partnersOf(id);
  return (
    <div
      role="dialog"
      aria-label={g.name(id)}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:absolute sm:inset-auto sm:bottom-3 sm:right-3 sm:top-3 sm:w-80 sm:rounded-2xl"
    >
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
      <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
        <X className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-3 pr-8">
        <Avatar g={g} id={id} size={56} />
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-tight text-slate-800">{g.name(id)}</h3>
          {p.nickname && <p className="text-sm italic text-slate-500">“{p.nickname}”</p>}
          {p.deceased && <p className="text-sm text-slate-500">In memory{years ? ` · ${years}` : ''}</p>}
          {g.hint(id) && <p className="text-xs text-slate-400">{g.hint(id)}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {g.isRootCouple(id) ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Where it all started</span>
        ) : branch !== undefined ? (
          <span className="rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: BRANCH_COLORS[branch % BRANCH_COLORS.length] }}>
            {g.get(g.branchHeads[branch])?.given}&apos;s line
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Family by marriage</span>
        )}
        {coming && (
          <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Coming in 2027
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onCenter(id)} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-700 hover:bg-slate-50">
          <Crosshair className="h-4 w-4" /> Center here
        </button>
        <button type="button" onClick={() => onRelate(id)} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-700 hover:bg-slate-50">
          <Users className="h-4 w-4" /> How related?
        </button>
        <button type="button" onClick={() => onShowLine(id)} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-700 hover:bg-slate-50">
          <GitBranch className="h-4 w-4" /> Their line
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <Chips g={g} label="Parents" ids={g.parentsOf(id)} onPick={onPick} />
        <Chips g={g} label={partners.length > 1 ? 'Partners' : 'Partner'} ids={partners} onPick={onPick} />
        <Chips g={g} label="Children" ids={g.childrenOf(id)} onPick={onPick} />
        <Chips g={g} label="Siblings" ids={g.siblingsOf(id)} onPick={onPick} />
      </div>
    </div>
  );
}
