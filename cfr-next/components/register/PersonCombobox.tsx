'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCircle2, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  nameKey,
  searchPeople,
  splitName,
  titleCase,
  type PublicPerson,
  type RegisteredPerson,
} from '@/lib/reunion-config';

export type SelectedPerson =
  | { kind: 'existing'; personId: string; displayName: string }
  | { kind: 'new'; given: string; family: string; displayName: string };

export const selectedKey = (p: SelectedPerson) =>
  p.kind === 'existing' ? p.personId : `new:${nameKey(p.given, p.family)}`;

export function formatRegistered(r: RegisteredPerson) {
  let when = '';
  try {
    when = ` on ${format(new Date(r.createdAt), 'MMM d')}`;
  } catch {}
  return `signed up by ${r.submittedByName}${when}`;
}

interface Props {
  people: PublicPerson[];
  registered: Map<string, RegisteredPerson>;
  value: SelectedPerson | null;
  onChange: (p: SelectedPerson | null) => void;
  /** Already chosen elsewhere in the form (hidden from results). */
  excludeKeys?: Set<string>;
  /** Attendee rows: refuse people who are already registered this year. */
  blockRegistered?: boolean;
  /** Offer "Add 'Jane Doe' as a new family member". */
  allowNew?: boolean;
  /** Called when the user picks someone who is already registered (and blockRegistered). */
  onBlocked?: (r: RegisteredPerson) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export default function PersonCombobox({
  people,
  registered,
  value,
  onChange,
  excludeKeys,
  blockRegistered = false,
  allowNew = true,
  onBlocked,
  placeholder = 'Start typing a name…',
  autoFocus,
  ariaLabel,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    if (query.trim().length < 1) return [];
    return searchPeople(people, query, 8).filter((p) => !excludeKeys?.has(p.id));
  }, [people, query, excludeKeys]);

  const typed = splitName(titleCase(query.trim()));
  const typedKey = nameKey(typed.given, typed.family);
  const hasTwoWords = typed.given.length > 0 && typed.family.length > 0;
  const exactExists = people.some((p) => nameKey(p.givenName, p.familyName) === typedKey);
  const showNew = allowNew && hasTwoWords && !exactExists && !excludeKeys?.has(`new:${typedKey}`);

  type Option = { type: 'person'; person: PublicPerson } | { type: 'new' };
  const options: Option[] = [
    ...results.map((person) => ({ type: 'person' as const, person })),
    ...(showNew ? [{ type: 'new' as const }] : []),
  ];

  const pick = (opt: Option) => {
    if (opt.type === 'new') {
      onChange({ kind: 'new', given: typed.given, family: typed.family, displayName: `${typed.given} ${typed.family}` });
    } else {
      const reg = registered.get(opt.person.id);
      if (blockRegistered && reg) {
        onBlocked?.(reg);
        return;
      }
      onChange({ kind: 'existing', personId: opt.person.id, displayName: opt.person.displayName });
    }
    setQuery('');
    setOpen(false);
  };

  // Selected state: show a pill with a clear button.
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-green-500 bg-green-50 px-4 min-h-[52px]">
        <span className="flex items-center gap-2 font-semibold text-slate-800 text-base">
          <Check className="w-5 h-5 text-green-600 shrink-0" />
          {value.displayName}
          {value.kind === 'new' && (
            <span className="text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">new</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1 p-2 -mr-2"
          aria-label={`Change ${value.displayName}`}
        >
          <X className="w-4 h-4" /> Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 min-h-[52px] text-base text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
      />

      {open && query.trim().length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl max-h-80 overflow-y-auto"
        >
          {options.map((opt, i) => {
            if (opt.type === 'new') {
              return (
                <li
                  key="__new"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer border-t border-slate-100 text-base',
                    i === active ? 'bg-amber-50' : 'bg-white'
                  )}
                >
                  <UserPlus className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>
                    Add <strong>{typed.given} {typed.family}</strong>
                    <span className="block text-sm text-slate-500">Not on the list? We&apos;ll add them.</span>
                  </span>
                </li>
              );
            }
            const reg = registered.get(opt.person.id);
            const subtitle = [
              opt.person.nickname && `“${opt.person.nickname}”`,
              opt.person.birthSurname && `née ${opt.person.birthSurname}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={opt.person.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-3 cursor-pointer text-base',
                  i === active ? 'bg-red-50' : 'bg-white',
                  blockRegistered && reg && 'opacity-70'
                )}
              >
                <span>
                  <span className="font-medium text-slate-800">{opt.person.displayName}</span>
                  {subtitle && <span className="block text-sm text-slate-500">{subtitle}</span>}
                </span>
                {reg && (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-1 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Signed up
                  </span>
                )}
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">
              {allowNew
                ? 'No match yet. Type a first and last name to add someone new.'
                : 'No one by that name yet.'}
            </li>
          )}
          {options.length > 0 && allowNew && !hasTwoWords && (
            <li className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
              Don&apos;t see them? Type a first and last name to add someone new.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
