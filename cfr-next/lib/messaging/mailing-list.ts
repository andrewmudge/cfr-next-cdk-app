import { randomBytes } from 'crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@/lib/reunion-db';

export const MAILING_LIST_TABLE = process.env.MAILING_LIST_TABLE || 'MailingList';

export type MemberSource = 'family' | 'registration' | 'account' | 'google-group' | 'manual';
export type MemberStatus = 'subscribed' | 'unsubscribed' | 'bounced' | 'complained';
export const MEMBER_STATUSES: MemberStatus[] = ['subscribed', 'unsubscribed', 'bounced', 'complained'];

/** One address on the master email list (the source of truth for family-wide emails). */
export interface MailingListMember {
  email: string; // lowercase, partition key
  name?: string;
  personId?: string;
  sources: MemberSource[];
  status: MemberStatus;
  statusReason?: string;
  unsubToken: string;
  addedAt: string;
  updatedAt: string;
}

export const normalizeEmail = (e: string) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (e: string) => EMAIL_RE.test(normalizeEmail(e));
const newToken = () => randomBytes(16).toString('hex');

export async function listMembers(): Promise<MailingListMember[]> {
  const items: MailingListMember[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: ScanCommandOutput = await docClient.send(new ScanCommand({ TableName: MAILING_LIST_TABLE, ExclusiveStartKey }));
    items.push(...((out.Items as MailingListMember[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

export async function getMember(email: string): Promise<MailingListMember | null> {
  const out = await docClient.send(new GetCommand({ TableName: MAILING_LIST_TABLE, Key: { email: normalizeEmail(email) } }));
  return (out.Item as MailingListMember) ?? null;
}

export interface UpsertInput {
  email: string;
  name?: string;
  personId?: string;
}

/**
 * Add addresses to the list, or merge a new source/name into existing rows.
 * Never changes an existing row's status: someone who unsubscribed, bounced or
 * complained stays that way no matter how many imports or syncs run.
 */
export async function upsertMembers(
  entries: UpsertInput[],
  source: MemberSource
): Promise<{ added: number; updated: number; skipped: number }> {
  const byEmail = new Map<string, UpsertInput>();
  let skipped = 0;
  for (const e of entries) {
    const email = normalizeEmail(e.email);
    if (!isEmail(email)) {
      skipped++;
      continue;
    }
    const prev = byEmail.get(email);
    byEmail.set(email, { email, name: e.name?.trim() || prev?.name, personId: e.personId || prev?.personId });
  }

  const existing = new Map((await listMembers()).map((m) => [m.email, m]));
  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const e of byEmail.values()) {
    const cur = existing.get(e.email);
    if (!cur) {
      const row: MailingListMember = {
        email: e.email,
        name: e.name || undefined,
        personId: e.personId || undefined,
        sources: [source],
        status: 'subscribed',
        unsubToken: newToken(),
        addedAt: now,
        updatedAt: now,
      };
      try {
        await docClient.send(
          new PutCommand({ TableName: MAILING_LIST_TABLE, Item: row, ConditionExpression: 'attribute_not_exists(email)' })
        );
        added++;
      } catch (err) {
        if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
        skipped++; // added concurrently (e.g. by a send); fine
      }
      continue;
    }
    const needsSource = !cur.sources?.includes(source);
    const needsName = !cur.name && !!e.name;
    const needsPerson = !cur.personId && !!e.personId;
    if (!needsSource && !needsName && !needsPerson) {
      skipped++;
      continue;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: MAILING_LIST_TABLE,
        Key: { email: e.email },
        UpdateExpression: 'SET sources = :src, #n = :n, personId = :p, updatedAt = :now',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':src': needsSource ? [...(cur.sources ?? []), source] : cur.sources ?? [source],
          ':n': cur.name || e.name || null,
          ':p': cur.personId || e.personId || null,
          ':now': now,
        },
      })
    );
    updated++;
  }
  return { added, updated, skipped };
}

export async function updateMember(
  email: string,
  patch: { name?: string; status?: MemberStatus }
): Promise<MailingListMember | null> {
  const sets = ['updatedAt = :now'];
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = { ':now': new Date().toISOString() };
  if (patch.name !== undefined) {
    sets.push('#n = :n');
    names['#n'] = 'name';
    vals[':n'] = patch.name.trim() || null;
  }
  if (patch.status) {
    sets.push('#s = :s', 'statusReason = :r');
    names['#s'] = 'status';
    vals[':s'] = patch.status;
    vals[':r'] = patch.status === 'subscribed' ? null : 'set by admin';
  }
  try {
    const out = await docClient.send(
      new UpdateCommand({
        TableName: MAILING_LIST_TABLE,
        Key: { email: normalizeEmail(email) },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: 'attribute_exists(email)',
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: vals,
        ReturnValues: 'ALL_NEW',
      })
    );
    return (out.Attributes as MailingListMember) ?? null;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}

export async function deleteMember(email: string): Promise<void> {
  await docClient.send(new DeleteCommand({ TableName: MAILING_LIST_TABLE, Key: { email: normalizeEmail(email) } }));
}

/** Unsubscribe link handler. Returns the address that was unsubscribed, or null for a bad token. */
export async function unsubscribeByToken(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const out = await docClient.send(
    new QueryCommand({
      TableName: MAILING_LIST_TABLE,
      IndexName: 'byUnsubToken',
      KeyConditionExpression: 'unsubToken = :t',
      ExpressionAttributeValues: { ':t': token },
      Limit: 1,
    })
  );
  const email = (out.Items?.[0] as { email?: string } | undefined)?.email;
  if (!email) return null;
  await docClient.send(
    new UpdateCommand({
      TableName: MAILING_LIST_TABLE,
      Key: { email },
      // Don't overwrite bounced/complained with the milder 'unsubscribed'.
      UpdateExpression: 'SET #s = :u, statusReason = :r, updatedAt = :now',
      ConditionExpression: '#s = :sub',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':u': 'unsubscribed', ':sub': 'subscribed', ':r': 'unsubscribe link', ':now': new Date().toISOString() },
    })
  ).catch((err) => {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
  });
  return email;
}

// ---------- CSV import (Google Groups "Export members") ----------

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/**
 * Pull { email, name } out of a Google Groups member export (or any CSV with an email column).
 * Google's export has a few title lines before the header row, so we look for the header.
 */
export function emailsFromCsv(text: string): { entries: UpsertInput[]; invalid: string[] } {
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => r.some((f) => /e-?mail/i.test(f)));
  const entries: UpsertInput[] = [];
  const invalid: string[] = [];

  if (headerIdx === -1) {
    // No header: take anything that looks like an email from every cell.
    for (const r of rows) for (const f of r) if (isEmail(f)) entries.push({ email: f });
    return { entries, invalid };
  }
  const header = rows[headerIdx].map((h) => h.trim().toLowerCase());
  const emailCol = header.findIndex((h) => /e-?mail/.test(h) && !/status|type|pref/.test(h));
  const nameCol = header.findIndex((h) => /^(nickname|name|display name|full name|member name)$/.test(h));
  const firstCol = header.findIndex((h) => /^first( name)?$/.test(h));
  const lastCol = header.findIndex((h) => /^last( name)?$/.test(h));

  for (const r of rows.slice(headerIdx + 1)) {
    const raw = (r[emailCol] ?? '').trim();
    if (!raw) continue;
    if (!isEmail(raw)) {
      invalid.push(raw);
      continue;
    }
    const name =
      (nameCol >= 0 ? r[nameCol]?.trim() : '') ||
      [firstCol >= 0 ? r[firstCol]?.trim() : '', lastCol >= 0 ? r[lastCol]?.trim() : ''].filter(Boolean).join(' ');
    entries.push({ email: raw, name: name || undefined });
  }
  return { entries, invalid };
}
