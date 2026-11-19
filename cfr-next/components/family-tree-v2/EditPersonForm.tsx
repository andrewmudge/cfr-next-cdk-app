'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PersonDetailsInput {
  given: string;
  family: string;
  nickname?: string;
  gender?: 'M' | 'F';
  deceased?: boolean;
  born?: number;
  died?: number;
}

interface Props {
  initial?: Partial<PersonDetailsInput>;
  submitLabel: string;
  onSubmit: (d: PersonDetailsInput) => Promise<void>;
  onCancel?: () => void;
}

const field =
  'w-full rounded-xl border-2 border-slate-200 bg-white px-3 min-h-[44px] text-base text-slate-900 focus:border-red-400 focus:outline-none';

/** Name / nickname / gender / in-memory fields, used for editing and for adding someone new. */
export default function EditPersonForm({ initial = {}, submitLabel, onSubmit, onCancel }: Props) {
  const [d, setD] = useState<PersonDetailsInput>({
    given: initial.given ?? '',
    family: initial.family ?? '',
    nickname: initial.nickname ?? '',
    gender: initial.gender,
    deceased: initial.deceased ?? false,
    born: initial.born,
    died: initial.died,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<PersonDetailsInput>) => setD((x) => ({ ...x, ...patch }));
  const year = (v: string) => (v.trim() ? parseInt(v, 10) || undefined : undefined);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.given.trim()) return;
        setSaving(true);
        try {
          await onSubmit({ ...d, nickname: d.nickname?.trim() || undefined });
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <input className={field} placeholder="First name" value={d.given} onChange={(e) => set({ given: e.target.value })} aria-label="First name" autoFocus />
        <input className={field} placeholder="Last name" value={d.family} onChange={(e) => set({ family: e.target.value })} aria-label="Last name" />
      </div>
      <input className={field} placeholder="Nickname (optional)" value={d.nickname ?? ''} onChange={(e) => set({ nickname: e.target.value })} aria-label="Nickname" />
      <div className="flex gap-2" role="radiogroup" aria-label="Gender">
        {([['M', 'Male'], ['F', 'Female'], [undefined, 'Not set']] as const).map(([v, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={d.gender === v}
            onClick={() => set({ gender: v })}
            className={cn(
              'flex-1 rounded-full border-2 min-h-[40px] text-sm font-medium',
              d.gender === v ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 text-slate-600'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 min-h-[36px]">
        <input type="checkbox" className="h-5 w-5 accent-slate-700" checked={!!d.deceased} onChange={(e) => set({ deceased: e.target.checked })} />
        Passed away (shown &ldquo;In memory&rdquo;)
      </label>
      {d.deceased && (
        <div className="grid grid-cols-2 gap-2">
          <input className={field} inputMode="numeric" placeholder="Born (year)" value={d.born ?? ''} onChange={(e) => set({ born: year(e.target.value) })} aria-label="Birth year" />
          <input className={field} inputMode="numeric" placeholder="Died (year)" value={d.died ?? ''} onChange={(e) => set({ died: year(e.target.value) })} aria-label="Death year" />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-slate-300 min-h-[44px] text-sm font-medium text-slate-700">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !d.given.trim()}
          className="flex flex-[2] items-center justify-center rounded-full bg-slate-800 min-h-[44px] text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </button>
      </div>
    </form>
  );
}
