'use client';

import { cn } from '@/lib/utils';
import { ACTIVITIES, type ActivityId } from '@/lib/reunion-config';

interface Props {
  value: ActivityId[];
  onChange: (v: ActivityId[]) => void;
}

const chip =
  'min-h-[44px] rounded-full border-2 px-4 py-2 text-sm sm:text-base font-medium transition-colors select-none';

export default function ActivityChips({ value, onChange }: Props) {
  const toggle = (id: ActivityId) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Activities">
      {ACTIVITIES.map((a) => {
        const on = value.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(a.id)}
            className={cn(
              chip,
              on
                ? 'border-red-500 bg-red-500 text-white shadow'
                : 'border-slate-300 bg-white text-slate-700 hover:border-red-300'
            )}
          >
            <span className="mr-1" aria-hidden>
              {a.emoji}
            </span>
            {a.label}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={value.length === 0}
        onClick={() => onChange([])}
        className={cn(
          chip,
          value.length === 0
            ? 'border-slate-500 bg-slate-600 text-white'
            : 'border-dashed border-slate-300 bg-white text-slate-500 hover:border-slate-400'
        )}
      >
        Just hanging out
      </button>
    </div>
  );
}
