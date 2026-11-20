// Shared (client + server) reunion config.

// ---------- Reunion year & dates (automatic) ----------
// The reunion runs Thursday through Labor Day Monday. On the Tuesday after Labor Day
// (midnight Pacific) everything rolls over to next year: titles, dates and sign-ups.

export const REUNION_TZ = 'America/Los_Angeles';
const FIRST_REUNION_YEAR = 1967; // 2027 is the 60th annual reunion

/** Day of September that Labor Day (first Monday) falls on. */
export function laborDay(year: number): number {
  const weekdayOfSep1 = new Date(Date.UTC(year, 8, 1)).getUTCDay(); // 0 = Sunday
  return 1 + ((1 - weekdayOfSep1 + 7) % 7);
}

/** The reunion year being planned right now (Pacific time). */
export function reunionYear(now: Date = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: REUNION_TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const afterLaborDay = m > 9 || (m === 9 && d > laborDay(y));
  return afterLaborDay ? y + 1 : y;
}

/** Year as the string key registrations are stored under. Call at use time (it changes yearly). */
export const currentReunionYear = () => String(reunionYear());

const ordinalSuffix = (n: number) => {
  const v = n % 100;
  return (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th');
};
export const ordinal = (n: number) => `${n}${ordinalSuffix(n)}`;

/** e.g. 61 for 2027. */
export const reunionNumber = (year: number) => year - FIRST_REUNION_YEAR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Thursday before Labor Day through Labor Day Monday. */
export function reunionDates(year: number) {
  const end = new Date(Date.UTC(year, 8, laborDay(year)));
  const start = new Date(Date.UTC(year, 8, laborDay(year) - 4));
  return { start, end };
}

/**
 *  'ordinal' -> "Sep 2nd - Sep 6th 2027"
 *  'short'   -> "Sep 2 - Sep 6, 2027"
 *  'long'    -> "September 2nd - September 6th"
 */
export function formatReunionDates(year: number, style: 'ordinal' | 'short' | 'long'): string {
  const { start, end } = reunionDates(year);
  const md = (d: Date, months: string[], ord: boolean) =>
    `${months[d.getUTCMonth()]} ${ord ? ordinal(d.getUTCDate()) : d.getUTCDate()}`;
  if (style === 'short') return `${md(start, MONTHS, false)} - ${md(end, MONTHS, false)}, ${year}`;
  if (style === 'long') return `${md(start, MONTHS_LONG, true)} - ${md(end, MONTHS_LONG, true)}`;
  return `${md(start, MONTHS, true)} - ${md(end, MONTHS, true)} ${year}`;
}

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

// ---------- Age groups & dues (amounts in cents, as Stripe expects) ----------

export const AGE_GROUPS = [
  { id: 'child_0_9', label: 'Child (0–9)', short: 'Child 0–9', duesCents: 0, games: 'none' },
  { id: 'child_10_17', label: 'Child (10–17)', short: 'Child 10–17', duesCents: 5000, games: 'no_poker' },
  { id: 'adult', label: 'Adult (18–79)', short: 'Adult', duesCents: 12500, games: 'all' },
  { id: 'senior', label: 'Senior (80+)', short: 'Senior', duesCents: 0, games: 'all' },
] as const;
export type AgeGroupId = (typeof AGE_GROUPS)[number]['id'];
export const AGE_GROUP_IDS = AGE_GROUPS.map((a) => a.id) as [AgeGroupId, ...AgeGroupId[]];

/** Rate options that only apply to the adult age group. */
export const ADULT_RATES = [
  { id: 'full', label: 'Full weekend', duesCents: 12500 },
  { id: 'day', label: 'Day visitor', duesCents: 7500 },
  { id: 'grandfather', label: 'Grandfather rate', duesCents: 5000 },
] as const;
export type AdultRateId = (typeof ADULT_RATES)[number]['id'];
export const ADULT_RATE_IDS = ADULT_RATES.map((r) => r.id) as [AdultRateId, ...AdultRateId[]];

export const DOG_DUES_CENTS = 500;
export const MAX_DOGS = 10;

export const ageGroupById = (id?: string) => AGE_GROUPS.find((a) => a.id === id);

/** Games each age group may sign up for: 0–9 none, 10–17 everything but poker, 18+ all. */
export function allowedActivities(ageGroup?: AgeGroupId): ActivityId[] {
  const g = ageGroupById(ageGroup);
  if (!g || g.games === 'none') return [];
  if (g.games === 'no_poker') return ACTIVITY_IDS.filter((a) => a !== 'poker');
  return [...ACTIVITY_IDS];
}

export function personDuesCents(ageGroup: AgeGroupId, adultRate?: AdultRateId): number {
  if (ageGroup === 'adult') {
    return (ADULT_RATES.find((r) => r.id === (adultRate ?? 'full')) ?? ADULT_RATES[0]).duesCents;
  }
  return ageGroupById(ageGroup)?.duesCents ?? 0;
}

export function rateLabel(ageGroup?: AgeGroupId, adultRate?: AdultRateId): string {
  const g = ageGroupById(ageGroup);
  if (!g) return '—';
  if (ageGroup === 'adult' && adultRate && adultRate !== 'full') {
    return `Adult · ${ADULT_RATES.find((r) => r.id === adultRate)?.label}`;
  }
  return g.short;
}

export interface DuesLine {
  label: string;
  detail: string;
  cents: number;
}

export function familyDues(
  attendees: { displayName: string; ageGroup: AgeGroupId; adultRate?: AdultRateId }[],
  dogs: number
): { lines: DuesLine[]; totalCents: number } {
  const lines: DuesLine[] = attendees.map((a) => ({
    label: a.displayName,
    detail: rateLabel(a.ageGroup, a.adultRate),
    cents: personDuesCents(a.ageGroup, a.adultRate),
  }));
  if (dogs > 0) {
    lines.push({ label: `🐕 ${dogs} ${dogs === 1 ? 'dog' : 'dogs'}`, detail: `$${DOG_DUES_CENTS / 100} each`, cents: dogs * DOG_DUES_CENTS });
  }
  return { lines, totalCents: lines.reduce((s, l) => s + l.cents, 0) };
}

export const formatDollars = (cents: number) =>
  cents === 0 ? 'FREE' : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Public, contact-free view of a family member (what the autocomplete gets). */
export interface PublicPerson {
  id: string;
  displayName: string;
  givenName: string;
  familyName: string;
  nickname?: string;
  birthSurname?: string;
  /** Extra text to tell same-name people apart, e.g. "child of Bill & Sarah-Beth". */
  hint?: string;
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

/** Admin pages can look at past years with ?year=YYYY. */
export function yearParam(url: string): string {
  const y = new URL(url).searchParams.get('year');
  return y && /^\d{4}$/.test(y) ? y : currentReunionYear();
}
