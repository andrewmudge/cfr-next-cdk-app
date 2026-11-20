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
        <div className="space-y-2">
          <p className="font-medium text-slate-700">
            Attendance Option <span className="text-red-600">*</span>
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Attendance option">
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
                    'flex min-h-[48px] w-full items-center gap-2 rounded-xl border-2 px-3 text-sm transition-colors sm:w-auto',
                    on
                      ? 'border-red-500 bg-red-50 font-semibold text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  )}
                >
                  {/* Radio circle */}
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                      on ? 'border-red-600 bg-red-600' : 'border-slate-400 bg-white'
                    )}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span>
                    {r.label} · <span className={cn(on && 'underline underline-offset-2')}>{formatDollars(r.duesCents)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
