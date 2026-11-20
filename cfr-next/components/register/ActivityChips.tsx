'use client';

import { cn } from '@/lib/utils';
import { ACTIVITIES, type ActivityId } from '@/lib/reunion-config';

interface Props {
  value: ActivityId[];
  onChange: (v: ActivityId[]) => void;
  /** Games this person's age group may pick. */
  allowed: ActivityId[];
}

const chip =
  'min-h-[44px] rounded-full border-2 px-4 py-2 text-sm sm:text-base font-medium transition-colors select-none';

export default function ActivityChips({ value, onChange, allowed }: Props) {
  if (allowed.length === 0) {
    return <p className="text-sm text-slate-500 italic">Games are for ages 10 and up 🙂</p>;
  }

  const toggle = (id: ActivityId) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Activities">
      {ACTIVITIES.map((a) => {
        const ok = allowed.includes(a.id);
        const on = ok && value.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            disabled={!ok}
            onClick={() => toggle(a.id)}
            title={ok ? undefined : 'Adults (18+) only'}
            className={cn(
              chip,
              !ok
                ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                : on
                  ? 'border-red-500 bg-red-500 text-white shadow'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-red-300'
            )}
          >
            <span className="mr-1" aria-hidden>
              {a.emoji}
            </span>
            {a.label}
            <span className={cn('ml-1 text-xs font-normal', on ? 'text-red-100' : 'text-slate-400')}>- {a.when}</span>
            {!ok && <span className="ml-1 text-xs">18+</span>}
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
