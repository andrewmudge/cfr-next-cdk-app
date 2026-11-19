'use client';

import { ArrowLeftRight, Sparkles, X } from 'lucide-react';
import PersonCombobox, { type SelectedPerson } from '@/components/register/PersonCombobox';
import type { PublicPerson, RegisteredPerson } from '@/lib/reunion-config';
import type { Relationship } from '@/lib/family-tree/relationship';

interface Props {
  people: PublicPerson[];
  a: SelectedPerson | null;
  b: SelectedPerson | null;
  onChange: (a: SelectedPerson | null, b: SelectedPerson | null) => void;
  result: Relationship | null;
  onShow: () => void;
  onClose: () => void;
}

const none = new Map<string, RegisteredPerson>();

export default function RelationshipFinder({ people, a, b, onChange, result, onShow, onClose }: Props) {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <button type="button" onClick={onClose} className="absolute right-2 top-2 rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
      <p className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
        <Sparkles className="h-5 w-5 text-red-500" /> How are we related?
      </p>
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <PersonCombobox people={people} registered={none} value={a} onChange={(p) => onChange(p, b)} allowNew={false} placeholder="First person…" ariaLabel="First person" />
        <button
          type="button"
          onClick={() => onChange(b, a)}
          className="mx-auto rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Swap people"
        >
          <ArrowLeftRight className="h-5 w-5 rotate-90 sm:rotate-0" />
        </button>
        <PersonCombobox people={people} registered={none} value={b} onChange={(p) => onChange(a, p)} allowNew={false} placeholder="Second person…" ariaLabel="Second person" />
      </div>
      {result && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-gradient-to-r from-red-50 to-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-semibold text-slate-800">{result.text}</p>
          {result.pathIds.length > 1 && (
            <button type="button" onClick={onShow} className="shrink-0 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Show on tree
            </button>
          )}
        </div>
      )}
    </div>
  );
}
