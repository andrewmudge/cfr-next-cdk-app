import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@/lib/reunion-db';

// Site-wide switches the admin flips from the admin console. Stored as one item in the
// registrations table under a reserved key (year = 'SETTINGS'), which no reunion year uses.
const REG_TABLE = process.env.REGISTRATIONS_TABLE || 'ReunionRegistrations';
const KEY = { year: 'SETTINGS', sk: 'SITE' };

export interface SiteSettings {
  /** When false, the public sign-up form is hidden and new sign-ups are refused. */
  signupsOpen: boolean;
  /** When false, the Churchwell Chronicle form and home-page card are hidden and new updates are refused. */
  chronicleOpen: boolean;
}
const DEFAULTS: SiteSettings = { signupsOpen: true, chronicleOpen: true };

// Short cache: the sign-up page and API read this on every request.
const CACHE_MS = 10_000;
let cache: { at: number; value: SiteSettings } | null = null;

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const out = await docClient.send(new GetCommand({ TableName: REG_TABLE, Key: KEY }));
  const item = (out.Item ?? {}) as Partial<SiteSettings>;
  const value: SiteSettings = {
    signupsOpen: item.signupsOpen ?? DEFAULTS.signupsOpen,
    chronicleOpen: item.chronicleOpen ?? DEFAULTS.chronicleOpen,
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function setSiteSettings(patch: Partial<SiteSettings>, updatedBy: string): Promise<SiteSettings> {
  cache = null;
  const value = { ...(await getSiteSettings()), ...patch };
  await docClient.send(
    new PutCommand({ TableName: REG_TABLE, Item: { ...KEY, ...value, updatedAt: new Date().toISOString(), updatedBy } })
  );
  cache = { at: Date.now(), value };
  return value;
}
