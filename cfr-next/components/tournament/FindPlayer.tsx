'use client';

import { useMemo, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TournamentView, ViewMatch, ViewTeam } from '@/lib/tournament/view';
import { MatchCard, genderWord, teamById } from './ui';

type Result = {
  personId: string;
  name: string;
  partner?: string;
  team?: ViewTeam;
  /** One line about where they stand. */
  line: string;
  tone: 'live' | 'next' | 'out' | 'champ' | 'wait';
  game?: ViewMatch;
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Every word typed must start a word in the name: "sar chu" finds "Sarah Churchwell". */
const matches = (name: string, q: string) => {
  const words = norm(name).split(/[\s\-']+/);
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => words.some((w) => w.startsWith(part)));
};

function describe(view: TournamentView, personId: string, name: string): Result {
  const games = view.matches.filter((m) => m.status !== 'bye');
  const teams = view.teams.filter((t) => t.male.personId === personId || t.female.personId === personId);
  // A player who came back as a wildcard is on two teams: show the one still playing.
  const team = teams.find((t) => t.status !== 'eliminated') ?? teams[teams.length - 1];
  const waiting = view.wildcards.find((w) => w.waiting.personId === personId && !w.teamId);

  if (!team && waiting) {
    const game = games.find((m) => m.a.wildcardId === waiting.id || m.b.wildcardId === waiting.id);
    return {
      personId,
      name,
      line: `No partner yet. Teams up with the first ${genderWord(waiting.neededGender)} knocked out${game ? `, then plays Game ${game.number}` : ''}.`,
      tone: 'wait',
      game,
    };
  }
  if (!team) return { personId, name, line: 'Not on a team.', tone: 'out' };

  const partner = (team.male.personId === personId ? team.female : team.male).name;
  const mine = games.filter((m) => m.a.teamId === team.id || m.b.teamId === team.id);
  const opp = (m: ViewMatch) => {
    const other = m.a.teamId === team.id ? m.b : m.a;
    return teamById(view, other.teamId)?.label ?? other.placeholder ?? 'TBD';
  };
  const base = { personId, name, partner, team };

  if (team.status === 'champion') return { ...base, line: 'Champions!', tone: 'champ' };
  const live = mine.find((m) => m.status === 'live');
  if (live)
    return {
      ...base,
      line: `Playing now${live.lane ? ` on ${view.laneName} ${live.lane}` : ''} · Game ${live.number} vs ${opp(live)}`,
      tone: 'live',
      game: live,
    };
  if (team.status === 'eliminated') {
    const lost = mine.find((m) => m.status === 'done' && m.loserTeamId === team.id);
    const me = team.male.personId === personId ? team.male : team.female;
    const comeback =
      !me.reentered && view.wildcards.some((w) => !w.teamId && w.neededGender === me.gender) ? ' Could still come back as a wildcard partner.' : '';
    return { ...base, line: `Out${lost ? ` after Game ${lost.number} (${lost.roundLabel})` : ''}.${comeback}`, tone: 'out', game: lost };
  }
  // Next game: first not-finished game in play order (could be waiting on another game).
  const next = [...mine].filter((m) => m.status === 'ready' || m.status === 'pending').sort((a, b) => a.order - b.order)[0];
  if (!next) return { ...base, line: 'Moving on. Next game to be decided.', tone: 'next' };
  const when =
    next.status === 'ready'
      ? view.upNext.includes(next.id)
        ? 'Up next'
        : 'Ready, waiting for an open ' + view.laneName.toLowerCase()
      : `Next: Game ${next.number}, once the other team is decided`;
  return {
    ...base,
    line: next.status === 'ready' ? `${when} · Game ${next.number} vs ${opp(next)}` : `${when} (vs ${opp(next)})`,
    tone: 'next',
    game: next,
  };
}

/** "Find your team": anyone types a name to see their partner and their game. */
export default function FindPlayer({ view, onOpen }: { view: TournamentView; onOpen: (m: ViewMatch) => void }) {
  const [q, setQ] = useState('');

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of view.teams) {
      map.set(t.male.personId, t.male.name);
      map.set(t.female.personId, t.female.name);
    }
    for (const w of view.wildcards) map.set(w.waiting.personId, w.waiting.name);
    return [...map.entries()].map(([personId, name]) => ({ personId, name }));
  }, [view.teams, view.wildcards]);

  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    return people
      .filter((p) => matches(p.name, q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((p) => describe(view, p.personId, p.name));
  }, [q, people, view]);

  return (
    <section className="mb-4" aria-label="Find your team">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find your name to see your partner"
          aria-label="Search for a player"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-10 pr-11 text-base text-slate-800 placeholder:text-slate-400 focus:border-red-400 focus:outline-none"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ('')}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {q.trim().length >= 2 && (
        <div className="mt-2 space-y-2" aria-live="polite">
          {results.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-sm text-slate-600 shadow-sm">
              No one named &quot;{q.trim()}&quot; is in this tournament. Check with the person running it.
            </p>
          ) : (
            results.map((r) => (
              <div key={r.personId} className="rounded-xl border-2 border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-lg font-bold text-slate-800">{r.name}</p>
                {r.partner ? (
                  <p className="text-slate-700">
                    Partner: <strong className="text-slate-900">{r.partner}</strong>
                    {r.team?.wildcardId && <Sparkles className="ml-1 inline h-4 w-4 text-amber-500" aria-label="Wildcard team" />}
                  </p>
                ) : null}
                <p
                  className={cn(
                    'mt-1 text-sm font-medium',
                    r.tone === 'live' && 'text-red-600',
                    r.tone === 'next' && 'text-emerald-700',
                    r.tone === 'out' && 'text-slate-500',
                    r.tone === 'champ' && 'text-amber-700',
                    r.tone === 'wait' && 'text-amber-800'
                  )}
                >
                  {r.line}
                </p>
                {r.game && r.tone !== 'out' && <MatchCard view={view} m={r.game} onOpen={onOpen} laneName={view.laneName} className="mt-2" />}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
