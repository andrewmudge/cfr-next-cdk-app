'use client';

import { cn } from '@/lib/utils';
import { GENDERS, type GenderId } from '@/lib/reunion-config';

interface Props {
  value?: GenderId;
  onChange: (gender: GenderId) => void;
}

export default function GenderPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:max-w-xs" role="radiogroup" aria-label="Gender">
      {GENDERS.map((g) => {
        const on = value === g.id;
        return (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(g.id)}
            className={cn(
              'min-h-[52px] rounded-xl border-2 px-2 font-semibold text-sm sm:text-base transition-colors',
              on
                ? 'border-red-500 bg-red-500 text-white shadow'
                : 'border-slate-300 bg-white text-slate-700 hover:border-red-300'
            )}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
