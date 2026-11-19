// Shared (client + server) reunion sign-up config.
// Bump REUNION_YEAR each year — registrations are partitioned by year.
export const REUNION_YEAR = '2027';

export const ACTIVITIES = [
  { id: 'cornhole', label: 'Cornhole', emoji: '🌽' },
  { id: 'golf', label: 'Golf', emoji: '⛳' },
  { id: 'horseshoes', label: 'Horseshoes', emoji: '🐎' },
  { id: 'darts', label: 'Darts', emoji: '🎯' },
  { id: 'poker', label: 'Poker', emoji: '🃏' },
  { id: 'eggtoss', label: 'Egg Toss', emoji: '🥚' },
] as const;

export type ActivityId = (typeof ACTIVITIES)[number]['id'];
export const ACTIVITY_IDS = ACTIVITIES.map((a) => a.id) as [ActivityId, ...ActivityId[]];

export const MAX_ATTENDEES = 25;

/** Public, contact-free view of a family member (what the autocomplete gets). */
export interface PublicPerson {
  id: string;
  displayName: string;
  givenName: string;
  familyName: string;
  nickname?: string;
  birthSurname?: string;
}

export interface RegisteredPerson {
  personId: string;
  displayName: string;
  submittedByName: string;
  createdAt: string;
}

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/['-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameKey(given: string, family: string): string {
  return normalizeName(`${given} ${family}`);
}

/**
 * Token-prefix match: every typed word must be the start of some word in the
 * person's given/family/nickname/birth surname. "jen chu" → Jennifer Churchwell.
 * Returns a score (higher is better) or -1 for no match.
 */
export function matchPerson(person: PublicPerson, query: string): number {
  const q = normalizeName(query).split(' ').filter(Boolean);
  if (q.length === 0) return 0;
  const words = normalizeName(
    [person.givenName, person.familyName, person.nickname, person.birthSurname].filter(Boolean).join(' ')
  ).split(' ');
  let score = 0;
  for (const token of q) {
    const idx = words.findIndex((w) => w.startsWith(token));
    if (idx === -1) return -1;
    score += words[idx] === token ? 3 : 1; // exact word beats prefix
    if (idx === 0) score += 1; // given-name hit ranks first
  }
  return score;
}

export function searchPeople(people: PublicPerson[], query: string, limit = 8): PublicPerson[] {
  return people
    .map((p) => ({ p, s: matchPerson(p, query) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.p.displayName.localeCompare(b.p.displayName))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Split "Jane Q Doe" → { given: "Jane Q", family: "Doe" }. */
export function splitName(full: string): { given: string; family: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 1) return { given: parts[0], family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
