// Shared (client + server) Churchwell Chronicle calendar.
//
// Two issues a year: Winter (Jan 15) and Spring (May 15). Updates are always being
// collected for the next issue; the cutoff is the 10th of the issue month (Pacific time)
// so there's a few days to review before it goes out. Anything sent after the cutoff
// rolls into the following issue.

import { REUNION_TZ } from '@/lib/reunion-config';

export const ISSUE_MONTHS = [1, 5] as const;
export const ISSUE_DAY = 15;
export const CUTOFF_DAY = 10;

export const CHRONICLE_NAME = 'The Churchwell Chronicle';
export const MAX_CONTENT_CHARS = 2000;
export const MAX_PHOTOS = 6;

/** e.g. "2027-01" */
export const ISSUE_ID_RE = /^\d{4}-(01|05)$/;
export const isIssueId = (s: unknown): s is string => typeof s === 'string' && ISSUE_ID_RE.test(s);

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface IssueInfo {
  id: string;
  year: number;
  month: number;
  /** "Winter" | "Spring" */
  season: string;
  /** "Winter 2027" */
  label: string;
  /** "January 15, 2027" */
  dateLabel: string;
  /** "January 10" */
  cutoffLabel: string;
}

export function issueInfo(id: string): IssueInfo {
  const year = Number(id.slice(0, 4));
  const month = Number(id.slice(5, 7));
  const season = month === 1 ? 'Winter' : 'Spring';
  return {
    id,
    year,
    month,
    season,
    label: `${season} ${year}`,
    dateLabel: `${MONTHS_LONG[month - 1]} ${ISSUE_DAY}, ${year}`,
    cutoffLabel: `${MONTHS_LONG[month - 1]} ${CUTOFF_DAY}`,
  };
}

const issueId = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

function pacificYMD(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: REUNION_TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/** The issue new updates go into right now: the next one whose cutoff hasn't passed. */
export function currentIssueId(now: Date = new Date()): string {
  const { y, m, d } = pacificYMD(now);
  for (const month of ISSUE_MONTHS) {
    if (m < month || (m === month && d <= CUTOFF_DAY)) return issueId(y, month);
  }
  return issueId(y + 1, ISSUE_MONTHS[0]);
}

export const currentIssue = (now: Date = new Date()) => issueInfo(currentIssueId(now));

/** The issue after this one ("2027-01" -> "2027-05" -> "2028-01"). */
export function nextIssueId(id: string): string {
  const { year, month } = issueInfo(id);
  const i = ISSUE_MONTHS.indexOf(month as (typeof ISSUE_MONTHS)[number]);
  return i < ISSUE_MONTHS.length - 1 ? issueId(year, ISSUE_MONTHS[i + 1]) : issueId(year + 1, ISSUE_MONTHS[0]);
}

/** The issue before this one. */
export function previousIssueId(id: string): string {
  const { year, month } = issueInfo(id);
  const i = ISSUE_MONTHS.indexOf(month as (typeof ISSUE_MONTHS)[number]);
  return i > 0 ? issueId(year, ISSUE_MONTHS[i - 1]) : issueId(year - 1, ISSUE_MONTHS[ISSUE_MONTHS.length - 1]);
}
