'use client';

import { useState } from 'react';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import PersonCombobox, { formatRegistered, type SelectedPerson } from './PersonCombobox';
import type { PublicPerson, RegisteredPerson } from '@/lib/reunion-config';

interface Props {
  people: PublicPerson[];
  registered: Map<string, RegisteredPerson>;
  year: string;
}

export default function AlreadyRegisteredLookup({ people, registered, year }: Props) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<SelectedPerson | null>(null);

  const reg = person?.kind === 'existing' ? registered.get(person.personId) : undefined;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 sm:p-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 text-slate-700 font-medium min-h-[44px]"
        >
          <Search className="w-5 h-5 text-red-500" />
          Already signed up? <span className="text-red-600 underline underline-offset-4">Check here</span>
        </button>
      ) : (
        <div className="space-y-3">
          <p className="font-semibold text-slate-800">Check if someone is signed up for {year}</p>
          <PersonCombobox
            people={people}
            registered={registered}
            value={person}
            onChange={setPerson}
            allowNew={false}
            autoFocus
            ariaLabel="Name to check"
          />
          {person &&
            (reg ? (
              <p className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-green-800">
                <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
                <span>
                  <strong>{person.displayName}</strong> is signed up! ({formatRegistered(reg)})
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-800">
                <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span>
                  <strong>{person.displayName}</strong> isn&apos;t signed up yet. You can add them below.
                </span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
