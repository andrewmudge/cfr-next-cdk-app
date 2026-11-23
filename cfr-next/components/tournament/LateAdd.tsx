'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { searchPeople, type PublicPerson } from '@/lib/reunion-config';
import { sendCommand, type useTournament } from '@/lib/tournament/client';
import type { GameId, Gender } from '@/lib/tournament/types';
import type { TournamentView } from '@/lib/tournament/view';

type Accept = ReturnType<typeof useTournament>['accept'];

/** What happened to the person we just added, worded for a toast. Family picks match by id, guests by name. */
function outcome(v: TournamentView, name: string, personId?: string) {
  const key = name.trim().toLowerCase();
  const isMe = (p: { personId: string; name: string }) => (personId ? p.personId === personId : p.name.trim().toLowerCase() === key);
  const t = v.teams.find((x) => isMe(x.male) || isMe(x.female));
  if (t) return `${name} is teamed up with ${isMe(t.male) ? t.female.name : t.male.name}.`;
  const w = v.wildcards.find((x) => isMe(x.waiting));
  if (w) return `${name} is in. They'll team up with the first ${w.neededGender === 'F' ? 'woman' : 'man'} knocked out. The bracket was redrawn to fit them.`;
  return `${name} is in as an alternate.`;
}

function GenderPick({ value, onChange }: { value?: Gender; onChange: (g: Gender) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Man or woman">
      {(['M', 'F'] as const).map((g) => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          onClick={() => onChange(g)}
          className={cn(
            'min-h-[48px] rounded-xl border-2 font-semibold',
            value === g ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 bg-white text-slate-700'
          )}
        >
          {g === 'M' ? 'Man' : 'Woman'}
        </button>
      ))}
    </div>
  );
}

/** "Add a late player": for someone who missed sign-up, until the first game goes on a lane. */
export default function LateAdd({ game, year, view, onChange }: { game: GameId; year: string; view: TournamentView; onChange: Accept }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<PublicPerson[] | null>(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<PublicPerson | null>(null);
  const [guest, setGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [gender, setGender] = useState<Gender | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || people) return;
    fetch('/api/people', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setPeople(d.people ?? []))
      .catch(() => setPeople([]));
  }, [open, people]);

  const inIt = useMemo(() => {
    const ids = new Set<string>();
    for (const t of view.teams) ids.add(t.male.personId).add(t.female.personId);
    for (const w of view.wildcards) ids.add(w.waiting.personId);
    return ids;
  }, [view.teams, view.wildcards]);
  const results = useMemo(() => (people && q.trim().length > 1 ? searchPeople(people, q, 8) : []), [people, q]);

  const reset = () => {
    setQ('');
    setPick(null);
    setGuest(false);
    setGuestName('');
    setGender(undefined);
  };
  const name = guest ? guestName.trim() : pick?.displayName ?? '';
  const ready = !!gender && (guest ? guestName.trim().length > 0 : !!pick);

  const add = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const r = await sendCommand(game, year, guest ? { type: 'lateAdd', name, gender } : { type: 'lateAdd', personId: pick!.id, gender });
      onChange(r.view, r.role);
      toast.success(outcome(r.view, name, guest ? undefined : pick!.id), { duration: 8000 });
      reset();
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Who a new man / woman would pair with right now.
  const waitingFor = (g: Gender) => view.wildcards.find((w) => !w.teamId && w.neededGender === g)?.waiting.name;

  return (
    <>
      <Button variant="outline" className="min-h-[44px]" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" /> Add a late player
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a late player</DialogTitle>
            <DialogDescription>
              For someone who missed sign-up. Everyone keeps their teams. If someone is waiting for a partner, the new player teams up with
              them. Otherwise they wait for a wildcard partner and the bracket is redrawn. You can add people until the first game starts.
            </DialogDescription>
          </DialogHeader>

          {!pick && !guest ? (
            <div className="space-y-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type their name…"
                aria-label="Search the family list"
                autoFocus
                className="h-12 w-full rounded-xl border-2 border-slate-300 px-3 text-base focus:border-red-500 focus:outline-none"
              />
              {people === null && q.trim().length > 1 && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading the family list…
                </p>
              )}
              {results.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {results.map((p) => {
                    const already = inIt.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={already}
                          className="min-h-[48px] w-full px-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                          onClick={() => {
                            setPick(p);
                            setGender(p.gender);
                          }}
                        >
                          {p.displayName} {p.hint && <span className="text-xs text-slate-400">({p.hint})</span>}
                          {already && <span className="ml-1 text-xs">· already playing</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  setGuest(true);
                  setGuestName(q.trim());
                }}
                className="min-h-[44px] text-sm font-medium text-red-700 underline-offset-2 hover:underline"
              >
                Not in the family list? Type their name instead
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {guest ? (
                <label className="block text-sm font-medium text-slate-700">
                  Their name
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={60}
                    autoFocus
                    placeholder="First and last name"
                    className="mt-1 h-12 w-full rounded-xl border-2 border-slate-300 px-3 text-base focus:border-red-500 focus:outline-none"
                  />
                </label>
              ) : (
                <p className="text-lg font-bold text-slate-800">{pick!.displayName}</p>
              )}
              <GenderPick value={gender} onChange={setGender} />
              {gender && (
                <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                  {waitingFor(gender)
                    ? `They'll team up with ${waitingFor(gender)}, who is waiting for a partner.`
                    : `Nobody is waiting for a ${gender === 'M' ? 'man' : 'woman'}, so they'll team up with the first ${gender === 'M' ? 'woman' : 'man'} knocked out. The bracket will be redrawn (teams stay the same).`}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" className="min-h-[48px]" onClick={reset} disabled={busy}>
                  Back
                </Button>
                <Button className="min-h-[48px] flex-1 bg-red-600 hover:bg-red-700" disabled={!ready || busy} onClick={add}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : `Add ${name || 'player'}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
