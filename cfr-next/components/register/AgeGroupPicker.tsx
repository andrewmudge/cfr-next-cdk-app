'use client';

import { cn } from '@/lib/utils';
import {
  ADULT_RATES,
  AGE_GROUPS,
  formatDollars,
  type AdultRateId,
  type AgeGroupId,
} from '@/lib/reunion-config';

interface Props {
  ageGroup?: AgeGroupId;
  adultRate?: AdultRateId;
  onChange: (ageGroup: AgeGroupId, adultRate?: AdultRateId) => void;
}

export default function AgeGroupPicker({ ageGroup, adultRate, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Age group">
        {AGE_GROUPS.map((g) => {
          const on = ageGroup === g.id;
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(g.id, g.id === 'adult' ? adultRate ?? 'full' : undefined)}
              className={cn(
                'min-h-[56px] rounded-xl border-2 px-2 py-2 text-center transition-colors leading-tight',
                on
                  ? 'border-red-500 bg-red-500 text-white shadow'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-red-300'
              )}
            >
              <span className="block font-semibold text-sm sm:text-base">{g.label}</span>
              <span className={cn('block text-xs', on ? 'text-red-100' : 'text-slate-500')}>
                {g.id === 'adult' ? 'from $50' : formatDollars(g.duesCents)}
              </span>
            </button>
          );
        })}
      </div>

      {ageGroup === 'adult' && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Adult rate">
          {ADULT_RATES.map((r) => {
            const on = (adultRate ?? 'full') === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange('adult', r.id)}
                className={cn(
                  'min-h-[40px] rounded-full border-2 px-3 text-sm font-medium transition-colors',
                  on
                    ? 'border-slate-700 bg-slate-700 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                )}
              >
                {r.label} · {formatDollars(r.duesCents)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
