'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Loader2, PartyPopper, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PersonCombobox, { formatRegistered, selectedKey, type SelectedPerson } from './PersonCombobox';
import ActivityChips from './ActivityChips';
import AlreadyRegisteredLookup from './AlreadyRegisteredLookup';
import { formatPhoneInput, isValidUSPhone } from '@/lib/phone-utils';
import {
  ACTIVITIES,
  MAX_ATTENDEES,
  REUNION_YEAR,
  type ActivityId,
  type PublicPerson,
  type RegisteredPerson,
} from '@/lib/reunion-config';

type Row = { key: string; person: SelectedPerson | null; activities: ActivityId[] };

interface Draft {
  submitter: SelectedPerson | null;
  email: string;
  phone: string;
  attending: boolean;
  selfActivities: ActivityId[];
  rows: Row[];
  notes: string;
}

const DRAFT_KEY = `cfr-register-draft-${REUNION_YEAR}`;
const newRow = (): Row => ({ key: Math.random().toString(36).slice(2), person: null, activities: [] });
const emptyDraft = (): Draft => ({
  submitter: null,
  email: '',
  phone: '',
  attending: true,
  selfActivities: [],
  rows: [],
  notes: '',
});

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyDraft(), ...JSON.parse(raw) };
  } catch {}
  return emptyDraft();
}

const toRef = (p: SelectedPerson) =>
  p.kind === 'existing' ? { personId: p.personId } : { newName: { given: p.given, family: p.family } };

const activityLabel = (ids: ActivityId[]) =>
  ids.length === 0
    ? 'Just hanging out'
    : ACTIVITIES.filter((a) => ids.includes(a.id))
        .map((a) => `${a.emoji} ${a.label}`)
        .join('  ');

const inputClass =
  'w-full rounded-xl border-2 border-slate-300 bg-white px-4 min-h-[52px] text-base text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

export default function RegisterSection() {
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [registered, setRegistered] = useState<Map<string, RegisteredPerson>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [removedNotice, setRemovedNotice] = useState<RegisteredPerson[]>([]);
  const [done, setDone] = useState<{ displayName: string; activities: ActivityId[] }[]>([]);
  const [website, setWebsite] = useState(''); // honeypot

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/people', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setPeople(data.people);
      setRegistered(new Map((data.registered as RegisteredPerson[]).map((r) => [r.personId, r])));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDraft(loadDraft());
    load();
  }, [load]);

  useEffect(() => {
    if (step === 'done') return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, step]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateRow = (key: string, patch: Partial<Row>) =>
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  const submitterReg =
    draft.submitter?.kind === 'existing' ? registered.get(draft.submitter.personId) : undefined;
  const selfAttending = draft.attending && !submitterReg;

  // Everyone chosen so far, so the same person can't be picked twice.
  const chosenKeys = useMemo(() => {
    const s = new Set<string>();
    if (draft.submitter && selfAttending) s.add(selectedKey(draft.submitter));
    draft.rows.forEach((r) => r.person && s.add(selectedKey(r.person)));
    return s;
  }, [draft, selfAttending]);

  const attendees = useMemo(() => {
    const list: { person: SelectedPerson; activities: ActivityId[] }[] = [];
    if (draft.submitter && selfAttending) list.push({ person: draft.submitter, activities: draft.selfActivities });
    draft.rows.forEach((r) => r.person && list.push({ person: r.person, activities: r.activities }));
    return list;
  }, [draft, selfAttending]);

  const blocked = (r: RegisteredPerson) =>
    toast.info(`${r.displayName} is already ${formatRegistered(r)}.`, { duration: 6000 });

  const validate = (): string | null => {
    if (!draft.submitter) return 'Please tell us your name first.';
    if (!draft.email.trim() && !draft.phone.trim()) return 'Please add an email or phone number so we can reach you.';
    if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) return 'That email address looks off.';
    if (draft.phone.trim() && !isValidUSPhone(draft.phone)) return 'Phone number should be 10 digits.';
    if (attendees.length === 0) return 'Add at least one person who is coming.';
    if (attendees.length > MAX_ATTENDEES) return `Please register at most ${MAX_ATTENDEES} people at a time.`;
    return null;
  };

  const goReview = () => {
    const err = validate();
    if (err) return toast.error(err);
    // Drop rows left blank so they don't confuse the summary.
    setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.person) }));
    setStep('review');
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
  };

  const submit = async () => {
    if (!draft.submitter) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitter: toRef(draft.submitter),
          email: draft.email,
          phone: draft.phone,
          attendees: attendees.map((a) => ({ person: toRef(a.person), activities: a.activities })),
          notes: draft.notes,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && Array.isArray(data.alreadyRegistered)) {
        const dupes = data.alreadyRegistered as RegisteredPerson[];
        const dupeIds = new Set(dupes.map((d) => d.personId));
        setRegistered((m) => {
          const next = new Map(m);
          dupes.forEach((d) => next.set(d.personId, d));
          return next;
        });
        // Remove them and let the user resubmit the rest with one tap.
        setDraft((d) => ({
          ...d,
          rows: d.rows.filter((r) => !(r.person?.kind === 'existing' && dupeIds.has(r.person.personId))),
        }));
        setRemovedNotice(dupes);
        setStep('review');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');

      setDone(data.attendees ?? attendees.map((a) => ({ displayName: a.person.displayName, activities: a.activities })));
      setStep('done');
      setRemovedNotice([]);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      load(); // refresh registered list + any newly added names
      document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    setDraft(emptyDraft());
    setDone([]);
    setStep('form');
  };

  return (
    <section id="register" className="py-20 bg-gradient-to-b from-white to-slate-50 scroll-mt-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center mb-8">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4">Sign Up for {REUNION_YEAR}</h2>
          <p className="text-lg text-slate-600">
            Let us know who&apos;s coming and what you want to play. One person can sign up the whole family.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : loadError ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-slate-700 mb-4">We couldn&apos;t load the sign-up form.</p>
            <Button onClick={load}>Try again</Button>
          </div>
        ) : step === 'done' ? (
          <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-lg text-center space-y-6">
            <PartyPopper className="w-14 h-14 text-red-500 mx-auto" />
            <h3 className="text-3xl font-bold text-slate-800">You&apos;re signed up! 🎉</h3>
            <ul className="text-left space-y-3">
              {done.map((a) => (
                <li key={a.displayName} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">{a.displayName}</p>
                  <p className="text-sm text-slate-600">{activityLabel(a.activities)}</p>
                </li>
              ))}
            </ul>
            <p className="text-slate-600">See you at the reunion!</p>
            <Button variant="outline" size="lg" className="w-full min-h-[52px]" onClick={startOver}>
              Sign up another family
            </Button>
          </div>
        ) : step === 'review' ? (
          <div className="rounded-2xl bg-white p-5 sm:p-8 shadow-lg space-y-6">
            {removedNotice.length > 0 && (
              <div className="flex gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold mb-1">Some people were already signed up, so we took them off:</p>
                  <ul className="list-disc ml-4">
                    {removedNotice.map((r) => (
                      <li key={r.personId}>
                        {r.displayName}, {formatRegistered(r)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <h3 className="text-2xl font-bold text-slate-800">Look good?</h3>
            <div className="text-slate-600 text-sm">
              Signed up by <strong className="text-slate-800">{draft.submitter?.displayName}</strong>
              {draft.email && <> · {draft.email}</>}
              {draft.phone && <> · {draft.phone}</>}
            </div>
            {attendees.length === 0 ? (
              <p className="text-slate-700">Everyone on this list is already signed up. There&apos;s nothing more to do!</p>
            ) : (
              <ul className="space-y-3">
                {attendees.map((a) => (
                  <li key={selectedKey(a.person)} className="rounded-xl bg-slate-50 p-4">
                    <p className="font-semibold text-slate-800">{a.person.displayName}</p>
                    <p className="text-sm text-slate-600">{activityLabel(a.activities)}</p>
                  </li>
                ))}
              </ul>
            )}
            {draft.notes && <p className="text-sm text-slate-600 italic">&ldquo;{draft.notes}&rdquo;</p>}
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button
                variant="outline"
                size="lg"
                className="min-h-[52px] sm:flex-1"
                onClick={() => {
                  setRemovedNotice([]);
                  setStep('form');
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Make changes
              </Button>
              {attendees.length > 0 && (
                <Button
                  size="lg"
                  className="min-h-[52px] sm:flex-[2] bg-red-600 hover:bg-red-700 text-white text-lg"
                  disabled={submitting}
                  onClick={submit}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : `Sign up ${attendees.length} ${attendees.length === 1 ? 'person' : 'people'}`}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <AlreadyRegisteredLookup people={people} registered={registered} year={REUNION_YEAR} />

            <form
              className="rounded-2xl bg-white p-5 sm:p-8 shadow-lg space-y-8"
              onSubmit={(e) => {
                e.preventDefault();
                goReview();
              }}
            >
              {/* Honeypot: hidden from people, bots fill it in */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              {/* Step 1 */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-slate-800 mb-2">
                  <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-red-600 text-white text-base mr-2">1</span>
                  About you
                </legend>
                <div className="space-y-2">
                  <label className="block font-medium text-slate-700">Your name</label>
                  <PersonCombobox
                    people={people}
                    registered={registered}
                    value={draft.submitter}
                    onChange={(p) => update({ submitter: p })}
                    excludeKeys={new Set(draft.rows.filter((r) => r.person).map((r) => selectedKey(r.person!)))}
                    ariaLabel="Your name"
                    placeholder="Start typing your name…"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="reg-email" className="block font-medium text-slate-700">Email</label>
                    <input
                      id="reg-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={draft.email}
                      onChange={(e) => update({ email: e.target.value })}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="reg-phone" className="block font-medium text-slate-700">Phone</label>
                    <input
                      id="reg-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={draft.phone}
                      onChange={(e) => update({ phone: formatPhoneInput(e.target.value) })}
                      placeholder="(555) 555-5555"
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-sm text-slate-500">Email or phone, whichever is easier. We only use it to reach you about the reunion.</p>
              </fieldset>

              {/* Step 2 */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-slate-800 mb-2">
                  <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-red-600 text-white text-base mr-2">2</span>
                  Who&apos;s coming?
                </legend>

                {draft.submitter && (
                  submitterReg ? (
                    <p className="rounded-xl bg-green-50 p-4 text-green-800 text-sm">
                      ✅ You&apos;re already signed up ({formatRegistered(submitterReg)}). Add anyone else below.
                    </p>
                  ) : (
                    <div className="rounded-xl border-2 border-slate-200 p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                        <input
                          type="checkbox"
                          checked={draft.attending}
                          onChange={(e) => update({ attending: e.target.checked })}
                          className="w-6 h-6 accent-red-600"
                        />
                        <span className="font-semibold text-slate-800">
                          I&apos;m coming ({draft.submitter.displayName})
                        </span>
                      </label>
                      {draft.attending && (
                        <>
                          <p className="text-sm text-slate-600">What do you want to play?</p>
                          <ActivityChips value={draft.selfActivities} onChange={(v) => update({ selfActivities: v })} />
                          {draft.rows.some((r) => r.person) && (
                            <button
                              type="button"
                              className="text-sm text-red-600 underline underline-offset-4"
                              onClick={() =>
                                setDraft((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, activities: [...d.selfActivities] })) }))
                              }
                            >
                              Copy my picks to everyone
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )
                )}

                {draft.rows.map((row, i) => (
                  <div key={row.key} className="rounded-xl border-2 border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">Family member {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== row.key) }))}
                        className="p-2 -mr-2 text-slate-400 hover:text-red-600"
                        aria-label="Remove this person"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    <PersonCombobox
                      people={people}
                      registered={registered}
                      value={row.person}
                      onChange={(p) => updateRow(row.key, { person: p })}
                      excludeKeys={chosenKeys}
                      blockRegistered
                      onBlocked={blocked}
                      autoFocus={!row.person && i === draft.rows.length - 1}
                      ariaLabel={`Family member ${i + 1} name`}
                    />
                    {row.person && (
                      <>
                        <p className="text-sm text-slate-600">What do they want to play?</p>
                        <ActivityChips value={row.activities} onChange={(v) => updateRow(row.key, { activities: v })} />
                      </>
                    )}
                  </div>
                ))}

                {attendees.length < MAX_ATTENDEES && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, newRow()] }))}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 min-h-[56px] text-slate-700 font-medium hover:border-red-400 hover:text-red-600"
                  >
                    <Plus className="w-5 h-5" />
                    {draft.rows.length === 0 && !selfAttending ? 'Add a person' : 'Add a family member'}
                  </button>
                )}

                {attendees.length > 0 && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Users className="w-4 h-4" /> {attendees.length} {attendees.length === 1 ? 'person' : 'people'} so far
                  </p>
                )}
              </fieldset>

              {/* Notes */}
              <div className="space-y-2">
                <label htmlFor="reg-notes" className="block font-medium text-slate-700">
                  Anything else? <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="reg-notes"
                  rows={2}
                  maxLength={1000}
                  value={draft.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="Dietary needs, arriving late, etc."
                  className={`${inputClass} py-3`}
                />
              </div>

              <Button type="submit" size="lg" className="w-full min-h-[56px] bg-red-600 hover:bg-red-700 text-white text-lg">
                Review sign-up
              </Button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
