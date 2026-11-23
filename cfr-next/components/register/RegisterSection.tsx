'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Loader2, PartyPopper, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PersonCombobox, { formatRegistered, selectedKey, type SelectedPerson } from './PersonCombobox';
import ActivityChips from './ActivityChips';
import AlreadyRegisteredLookup from './AlreadyRegisteredLookup';
import AgeGroupPicker from './AgeGroupPicker';
import GenderPicker from './GenderPicker';
import { formatPhoneInput, isValidUSPhone } from '@/lib/phone-utils';
import {
  ACTIVITIES,
  GENDERS,
  MAX_ATTENDEES,
  MAX_DOGS,
  currentReunionYear,
  allowedActivities,
  familyDues,
  formatDollars,
  type ActivityId,
  type AdultRateId,
  type AgeGroupId,
  type DuesLine,
  type GenderId,
  type PublicPerson,
  type RegisteredPerson,
} from '@/lib/reunion-config';

type Row = {
  key: string;
  person: SelectedPerson | null;
  gender?: GenderId;
  ageGroup?: AgeGroupId;
  adultRate?: AdultRateId;
  activities: ActivityId[];
};

type Attendee = { person: SelectedPerson; gender?: GenderId; ageGroup?: AgeGroupId; adultRate?: AdultRateId; activities: ActivityId[] };

interface Draft {
  submitter: SelectedPerson | null;
  email: string;
  phone: string;
  selfGender?: GenderId;
  selfAgeGroup?: AgeGroupId;
  selfAdultRate?: AdultRateId;
  selfActivities: ActivityId[];
  rows: Row[];
  dogs: number;
}

// Drafts are per reunion year, so a half-filled form doesn't carry over after Labor Day.
const draftKey = () => `cfr-register-draft-${currentReunionYear()}-v3`;
const newRow = (): Row => ({ key: Math.random().toString(36).slice(2), person: null, activities: [] });
const emptyDraft = (): Draft => ({
  submitter: null,
  email: '',
  phone: '',
  selfActivities: [],
  rows: [],
  dogs: 0,
});

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(draftKey());
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

/** Changing age group drops any games that group can't play. */
const withAge = (activities: ActivityId[], ageGroup: AgeGroupId) => {
  const allowed = allowedActivities(ageGroup);
  return activities.filter((a) => allowed.includes(a));
};

function DuesSummary({ lines, totalCents }: { lines: DuesLine[]; totalCents: number }) {
  return (
    <div className="rounded-xl border-2 border-slate-200 overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-slate-700">
              {l.label} <span className="text-slate-400">· {l.detail}</span>
            </span>
            <span className="font-medium text-slate-800">{formatDollars(l.cents)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
        <span className="font-semibold">Total due</span>
        <span className="text-2xl font-bold">{totalCents === 0 ? '$0' : formatDollars(totalCents)}</span>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border-2 border-slate-300 bg-white px-4 min-h-[52px] text-base text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

export default function RegisterSection() {
  const year = currentReunionYear();
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [registered, setRegistered] = useState<Map<string, RegisteredPerson>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [step, setStep] = useState<'form' | 'dogs' | 'review' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [removedNotice, setRemovedNotice] = useState<RegisteredPerson[]>([]);
  const [done, setDone] = useState<{
    attendees: { displayName: string; activities: ActivityId[] }[];
    lines: DuesLine[];
    totalCents: number;
    submitterName: string;
  } | null>(null);
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
      localStorage.setItem(draftKey(), JSON.stringify(draft));
    } catch {}
  }, [draft, step]);

  /** Gender on the person's profile, to pre-fill the picker (new names start blank). */
  const profileGender = (p: SelectedPerson | null): GenderId | undefined =>
    p?.kind === 'existing' ? people.find((x) => x.id === p.personId)?.gender : undefined;

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateRow = (key: string, patch: Partial<Row>) =>
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  // Masked contact info on file for the selected submitter (real values never reach the browser).
  const [onFile, setOnFile] = useState<{ email?: string; phone?: string } | null>(null);
  const [useOnFile, setUseOnFile] = useState(true);
  const submitterId = draft.submitter?.kind === 'existing' ? draft.submitter.personId : null;
  useEffect(() => {
    setOnFile(null);
    setUseOnFile(true);
    if (!submitterId) return;
    let cancelled = false;
    fetch(`/api/people/contact-hint?personId=${encodeURIComponent(submitterId)}`)
      .then((r) => (r.ok ? r.json() : { onFile: null }))
      .then((d) => !cancelled && setOnFile(d.onFile ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [submitterId]);
  const usingOnFile = !!onFile && useOnFile;
  // Fields the user types: everything, or just what's missing from the on-file contact.
  const askEmail = !usingOnFile || !onFile?.email;
  const askPhone = !usingOnFile || !onFile?.phone;

  const submitterReg =
    draft.submitter?.kind === 'existing' ? registered.get(draft.submitter.personId) : undefined;
  const selfAttending = !submitterReg; // whoever signs up is coming

  // Everyone chosen so far, so the same person can't be picked twice.
  const chosenKeys = useMemo(() => {
    const s = new Set<string>();
    if (draft.submitter && selfAttending) s.add(selectedKey(draft.submitter));
    draft.rows.forEach((r) => r.person && s.add(selectedKey(r.person)));
    return s;
  }, [draft, selfAttending]);

  const attendees = useMemo(() => {
    const list: Attendee[] = [];
    if (draft.submitter && selfAttending) {
      list.push({
        person: draft.submitter,
        gender: draft.selfGender,
        ageGroup: draft.selfAgeGroup,
        adultRate: draft.selfAdultRate,
        activities: draft.selfActivities,
      });
    }
    draft.rows.forEach(
      (r) => r.person && list.push({ person: r.person, gender: r.gender, ageGroup: r.ageGroup, adultRate: r.adultRate, activities: r.activities })
    );
    return list;
  }, [draft, selfAttending]);

  const reviewDues = useMemo(
    () =>
      familyDues(
        attendees
          .filter((a) => a.ageGroup)
          .map((a) => ({ displayName: a.person.displayName, ageGroup: a.ageGroup!, adultRate: a.adultRate })),
        draft.dogs
      ),
    [attendees, draft.dogs]
  );

  const blocked = (r: RegisteredPerson) =>
    toast.info(`${r.displayName} is already ${formatRegistered(r)}.`, { duration: 6000 });

  const validate = (): string | null => {
    if (!draft.submitter) return 'Please tell us your name first.';
    if (!usingOnFile && !draft.email.trim() && !draft.phone.trim()) return 'Please add an email or phone number so we can reach you.';
    if (askEmail && draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) return 'That email address looks off.';
    if (askPhone && draft.phone.trim() && !isValidUSPhone(draft.phone)) return 'Phone number should be 10 digits.';
    if (attendees.length === 0) return 'Add at least one person who is coming.';
    if (attendees.length > MAX_ATTENDEES) return `Please register at most ${MAX_ATTENDEES} people at a time.`;
    const noGender = attendees.find((a) => !a.gender);
    if (noGender) return `Please pick male or female for ${noGender.person.displayName}.`;
    const noAge = attendees.find((a) => !a.ageGroup);
    if (noAge) return `Please pick an age group for ${noAge.person.displayName}.`;
    return null;
  };

  const goTo = (next: 'dogs' | 'review') => {
    setStep(next);
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
  };

  /** Step 1 -> step 2 (dogs). */
  const goDogs = () => {
    const err = validate();
    if (err) return toast.error(err);
    // Drop rows left blank so they don't confuse the summary.
    setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.person) }));
    goTo('dogs');
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
          email: askEmail ? draft.email : '',
          phone: askPhone ? draft.phone : '',
          useContactOnFile: usingOnFile,
          attendees: attendees.map((a) => ({
            person: toRef(a.person),
            gender: a.gender,
            ageGroup: a.ageGroup,
            adultRate: a.ageGroup === 'adult' ? a.adultRate ?? 'full' : undefined,
            activities: a.activities,
          })),
          dogs: draft.dogs,
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

      setDone({
        attendees: data.attendees ?? [],
        lines: data.lines ?? [],
        totalCents: data.totalCents ?? 0,
        submitterName: draft.submitter.displayName,
      });
      setStep('done');
      setRemovedNotice([]);
      try {
        localStorage.removeItem(draftKey());
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
    setDone(null);
    setStep('form');
  };

  return (
    <section id="register" className="py-20 bg-gradient-to-b from-white to-slate-50 scroll-mt-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center mb-8">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4">Sign Up for {year}</h2>
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
        ) : step === 'done' && done ? (
          <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-lg space-y-6">
            <div className="text-center space-y-2">
              <PartyPopper className="w-14 h-14 text-red-500 mx-auto" />
              <h3 className="text-3xl font-bold text-slate-800">You&apos;re signed up! 🎉</h3>
            </div>
            <ul className="space-y-2">
              {done.attendees.map((a) => (
                <li key={a.displayName} className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-800">{a.displayName}</p>
                  <p className="text-sm text-slate-600">{activityLabel(a.activities)}</p>
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-800">Your family&apos;s dues</h4>
              <DuesSummary lines={done.lines} totalCents={done.totalCents} />
            </div>
            {done.totalCents > 0 ? (
              <div className="text-center space-y-2">
                <Button
                  size="lg"
                  className="w-full min-h-[56px] bg-[#008CFF] hover:bg-[#0074d4] text-white text-lg"
                  onClick={() => window.open('https://venmo.com/churchwellreunion', '_blank')}
                >
                  Pay {formatDollars(done.totalCents)} via Venmo
                </Button>
                <p className="text-sm text-slate-500">
                  Venmo @churchwellreunion. In the note, please write:{' '}
                  <strong className="text-slate-700">CFR {year} – {done.submitterName}</strong>
                </p>
              </div>
            ) : (
              <p className="text-center text-slate-600">No dues for your group. See you at the reunion!</p>
            )}
            <Button variant="outline" size="lg" className="w-full min-h-[52px]" onClick={startOver}>
              Sign up another family
            </Button>
          </div>
        ) : step === 'dogs' ? (
          <div className="rounded-2xl bg-white p-5 sm:p-8 shadow-lg space-y-6">
            <p className="text-sm font-medium text-slate-400">Step 2 of 2</p>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Bringing any dogs?</h3>
              <p className="text-slate-600 mt-1">Dogs are $5 each for the weekend. Leave it at 0 if you&apos;re not bringing any.</p>
            </div>
          {/* Dog counter */}
          <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-slate-200 p-4">
            <div>
              <p className="font-semibold text-slate-800">🐕 Dogs</p>
              <p className="text-sm text-slate-500">$5 per dog</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="One less dog"
                disabled={draft.dogs <= 0}
                onClick={() => update({ dogs: Math.max(0, draft.dogs - 1) })}
                className="w-11 h-11 rounded-full border-2 border-slate-300 text-xl font-bold text-slate-700 disabled:opacity-30"
              >
                −
              </button>
              <span className="w-6 text-center text-xl font-bold text-slate-800" aria-live="polite">
                {draft.dogs}
              </span>
              <button
                type="button"
                aria-label="One more dog"
                disabled={draft.dogs >= MAX_DOGS}
                onClick={() => update({ dogs: Math.min(MAX_DOGS, draft.dogs + 1) })}
                className="w-11 h-11 rounded-full border-2 border-slate-300 text-xl font-bold text-slate-700 disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button variant="outline" size="lg" className="min-h-[52px] sm:flex-1" onClick={() => setStep('form')}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button size="lg" className="min-h-[52px] sm:flex-[2] bg-red-600 hover:bg-red-700 text-white text-lg" onClick={() => goTo('review')}>
                Review sign-up
              </Button>
            </div>
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
              {usingOnFile ? (
                <>
                  {onFile?.email ? <> · {onFile.email}</> : draft.email && <> · {draft.email}</>}
                  {onFile?.phone ? <> · {onFile.phone}</> : draft.phone && <> · {draft.phone}</>}
                </>
              ) : (
                <>
                  {draft.email && <> · {draft.email}</>}
                  {draft.phone && <> · {draft.phone}</>}
                </>
              )}
            </div>
            {attendees.length === 0 ? (
              <p className="text-slate-700">Everyone on this list is already signed up. There&apos;s nothing more to do!</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {attendees.map((a) => (
                    <li key={selectedKey(a.person)} className="rounded-xl bg-slate-50 p-4">
                      <p className="font-semibold text-slate-800">
                        {a.person.displayName}{' '}
                        <span className="text-sm font-normal text-slate-500">
                          · {GENDERS.find((g) => g.id === a.gender)?.label}
                        </span>
                      </p>
                      <p className="text-sm text-slate-600">{activityLabel(a.activities)}</p>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-800">Dues</h4>
                  <DuesSummary lines={reviewDues.lines} totalCents={reviewDues.totalCents} />
                </div>
              </>
            )}
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
            <AlreadyRegisteredLookup people={people} registered={registered} year={year} />

            <form
              className="rounded-2xl bg-white p-5 sm:p-8 shadow-lg space-y-8"
              onSubmit={(e) => {
                e.preventDefault();
                goDogs();
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

              <p className="text-sm font-medium text-slate-400">Step 1 of 2</p>

              {/* About you (the person signing up is always coming) */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-slate-800 mb-2">About you</legend>
                <div className="space-y-2">
                  <label className="block font-medium text-slate-700">Your name</label>
                  <PersonCombobox
                    people={people}
                    registered={registered}
                    value={draft.submitter}
                    onChange={(p) => update({ submitter: p, selfGender: profileGender(p) })}
                    excludeKeys={new Set(draft.rows.filter((r) => r.person).map((r) => selectedKey(r.person!)))}
                    ariaLabel="Your name"
                    placeholder="Start typing your name…"
                  />
                </div>
                {usingOnFile ? (
                  <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-2">
                    <p className="font-medium text-green-800">✓ We have your contact info on file</p>
                    <p className="text-sm text-green-900">
                      {[onFile?.email, onFile?.phone].filter(Boolean).join(' · ')}
                    </p>
                    {(!onFile?.email || !onFile?.phone) && (
                      <div className="space-y-2 pt-2">
                        <label htmlFor="reg-missing" className="block font-medium text-slate-700">
                          {onFile?.email ? 'Add your phone number' : 'Add your email'}{' '}
                          <span className="font-normal text-slate-500">(helps us keep the family contact list current)</span>
                        </label>
                        {onFile?.email ? (
                          <input
                            id="reg-missing"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={draft.phone}
                            onChange={(e) => update({ phone: formatPhoneInput(e.target.value) })}
                            placeholder="(555) 555-5555"
                            className={inputClass}
                          />
                        ) : (
                          <input
                            id="reg-missing"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            value={draft.email}
                            onChange={(e) => update({ email: e.target.value })}
                            placeholder="you@example.com"
                            className={inputClass}
                          />
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setUseOnFile(false)}
                      className="text-sm text-red-600 underline underline-offset-4 min-h-[32px]"
                    >
                      Use different contact info
                    </button>
                  </div>
                ) : (
                  <>
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
                    {onFile && (
                      <button
                        type="button"
                        onClick={() => setUseOnFile(true)}
                        className="text-sm text-slate-600 underline underline-offset-4"
                      >
                        Use the contact info we have on file instead
                      </button>
                    )}
                  </>
                )}
                {!usingOnFile && (
                  <p className="text-sm text-slate-500">Email or phone, whichever is easier. We only use it to reach you about the reunion.</p>
                )}

                {draft.submitter &&
                  (submitterReg ? (
                    <p className="rounded-xl bg-green-50 p-4 text-green-800 text-sm">
                      ✅ You&apos;re already signed up ({formatRegistered(submitterReg)}). You can still add family members below.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="font-medium text-slate-700">Gender</p>
                      <GenderPicker value={draft.selfGender} onChange={(g) => update({ selfGender: g })} />
                      <p className="font-medium text-slate-700">Your age group</p>
                      <AgeGroupPicker
                        ageGroup={draft.selfAgeGroup}
                        adultRate={draft.selfAdultRate}
                        onChange={(g, rate) =>
                          update({ selfAgeGroup: g, selfAdultRate: rate, selfActivities: withAge(draft.selfActivities, g) })
                        }
                      />
                      {draft.selfAgeGroup && (
                        <>
                          <p className="font-medium text-slate-700">What do you want to play?</p>
                          <ActivityChips
                            value={draft.selfActivities}
                            onChange={(v) => update({ selfActivities: v })}
                            allowed={allowedActivities(draft.selfAgeGroup)}
                          />
                          {draft.rows.some((r) => r.person && r.ageGroup) && draft.selfActivities.length > 0 && (
                            <button
                              type="button"
                              className="text-sm text-red-600 underline underline-offset-4"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  rows: d.rows.map((r) => (r.ageGroup ? { ...r, activities: withAge(d.selfActivities, r.ageGroup) } : r)),
                                }))
                              }
                            >
                              Copy my picks to everyone
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
              </fieldset>

              {/* Family members (shown once the person signing up has picked their name) */}
              {draft.submitter && (
              <div className="space-y-4">
                {draft.rows.map((row, i) => (
                  <div key={row.key} className="rounded-xl border-2 border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">Friend or Family Member {i + 1}</span>
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
                      onChange={(p) => updateRow(row.key, { person: p, gender: profileGender(p) })}
                      excludeKeys={chosenKeys}
                      blockRegistered
                      onBlocked={blocked}
                      autoFocus={!row.person && i === draft.rows.length - 1}
                      ariaLabel={`Friend or family member ${i + 1} name`}
                    />
                    {row.person && (
                      <>
                        <p className="text-sm text-slate-600">Gender</p>
                        <GenderPicker value={row.gender} onChange={(g) => updateRow(row.key, { gender: g })} />
                        <p className="text-sm text-slate-600">Age group</p>
                        <AgeGroupPicker
                          ageGroup={row.ageGroup}
                          adultRate={row.adultRate}
                          onChange={(g, rate) =>
                            updateRow(row.key, { ageGroup: g, adultRate: rate, activities: withAge(row.activities, g) })
                          }
                        />
                        {row.ageGroup && (
                          <>
                            <p className="text-sm text-slate-600">What do they want to play?</p>
                            <ActivityChips
                              value={row.activities}
                              onChange={(v) => updateRow(row.key, { activities: v })}
                              allowed={allowedActivities(row.ageGroup)}
                            />
                          </>
                        )}
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
                    Add a friend or family member
                  </button>
                )}

                {attendees.length > 0 && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Users className="w-4 h-4" /> {attendees.length} {attendees.length === 1 ? 'person' : 'people'} so far
                  </p>
                )}
              </div>
              )}

              <Button type="submit" size="lg" className="w-full min-h-[56px] bg-red-600 hover:bg-red-700 text-white text-lg">
                Next
              </Button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
