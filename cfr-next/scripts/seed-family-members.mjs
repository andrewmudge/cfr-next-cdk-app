#!/usr/bin/env node
/**
 * Seed the FamilyMembers DynamoDB table used by the reunion sign-up autocomplete.
 *
 *   node scripts/seed-family-members.mjs --dry-run      # print what would be written
 *   node scripts/seed-family-members.mjs                # write
 *
 * Options:
 *   --tree <path>     Family Echo export (default: public/FamilyTree.html)
 *   --signup <path>   Past sign-up CSV with givenName,familyName columns
 *                     (default: data/2025_Reunion_Sign-Up_2025-07-05_22_46_52.csv, falling back to public/)
 *
 *   --skip-cognito    Don't read names/contacts from the site's Cognito accounts
 *
 * Contact info (email/phone) is attached server-side only, from the sign-up CSV and Cognito
 * (Cognito wins, it's newer). It is never returned by public endpoints.
 * IDs are deterministic (ft_<FamilyEchoID>, su_<name-slug>) so re-running is safe.
 * Existing items are overwritten, but `verified` and `createdAt` are kept when present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DRY = flag('--dry-run');
const SKIP_COGNITO = flag('--skip-cognito');
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_o0wJlnxyH';
const TABLE = process.env.FAMILY_MEMBERS_TABLE || 'FamilyMembers';
const TREE = path.resolve(ROOT, opt('--tree', 'public/FamilyTree.html'));
// People removed from the sign-up list on request. They're skipped on every re-seed.
const EXCLUDE_IDS = new Set([
  'ft_G51PX', // Angela Mudge (removed 2026-11-19)
]);
// Same people by name, so they aren't re-added from the sign-up CSV or Cognito accounts.
const EXCLUDE_NAMES = new Set(['angela mudge']);
const SIGNUP_NAME = '2025_Reunion_Sign-Up_2025-07-05_22_46_52.csv';
const SIGNUP = path.resolve(
  ROOT,
  opt('--signup', fs.existsSync(path.join(ROOT, 'data', SIGNUP_NAME)) ? `data/${SIGNUP_NAME}` : `public/${SIGNUP_NAME}`)
);

// Keep in sync with normalizeName/nameKey in lib/reunion-config.ts
const normalizeName = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/['-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const nameKey = (g, f) => normalizeName(`${g} ${f}`);
const slug = (s) => normalizeName(s).replace(/\s+/g, '-');
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
// "DEVIN RIKER" -> "Devin Riker"; leaves "McDonald" alone.
const fixCase = (s) =>
  /[a-z]/.test(s) ? s.replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
// Skip spreadsheet junk like "#SPILL!"
const looksLikeName = (s) => /^[\p{L}][\p{L} .'-]*$/u.test(s);

const decodeEntities = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function toObjects(rows) {
  const [header, ...body] = rows;
  const h = header.map((x) => x.replace(/^﻿/, '').trim());
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

// ---- 1. Family tree ----
const html = fs.readFileSync(TREE, 'utf8');
const m = html.match(/<INPUT TYPE="hidden" ID="csv" VALUE="([\s\S]*?)">/i);
if (!m) throw new Error(`No #csv block found in ${TREE}`);
const treeRows = toObjects(parseCsv(decodeEntities(m[1])));

const now = new Date().toISOString();
const byKey = new Map();
const items = [];
let skippedBlank = 0;

for (const r of treeRows) {
  const given = clean(r['Given names']);
  const now_ = clean(r['Surname now']);
  const birth = clean(r['Surname at birth']);
  const family = now_ || birth;
  if (!given) {
    skippedBlank++;
    continue;
  }
  if (EXCLUDE_IDS.has(`ft_${r.ID}`)) continue;
  const key = nameKey(given, family);
  const item = {
    personId: `ft_${r.ID}`,
    givenName: given,
    familyName: family,
    nickname: clean(r['Nickname']) || undefined,
    birthSurname: birth && birth !== family ? birth : undefined,
    displayName: `${given} ${family}`.trim(),
    nameKey: key,
    source: 'familytree',
    verified: true,
    deceased: !!clean(r['Deceased']) || undefined,
    createdAt: now,
  };
  item._parents = [clean(r['Mother name']).split(' ')[0], clean(r['Father name']).split(' ')[0]].filter(Boolean);
  item._gender = clean(r['Gender']);
  if (!byKey.has(key)) byKey.set(key, item);
  items.push(item);
}
const treeCount = items.length;

// Same name in the tree (usually father/son): disambiguate with parents' first names.
const groups = new Map();
for (const it of items) groups.set(it.nameKey, [...(groups.get(it.nameKey) ?? []), it]);
for (const group of groups.values()) {
  if (group.length < 2) continue;
  for (const it of group) {
    if (it._parents.length) {
      const rel = it._gender === 'Male' ? 'son' : it._gender === 'Female' ? 'daughter' : 'child';
      it.displayName = `${it.displayName} (${rel} of ${it._parents.join(' & ')})`;
    }
  }
  console.log(`  ~ same name in tree, labelled: ${group.map((g) => g.displayName).join(' / ')}`);
}
for (const it of items) {
  delete it._parents;
  delete it._gender;
}

const contacts = new Map(); // nameKey -> { email?, phone? }
const normPhone = (p) => {
  const d = String(p ?? '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return undefined;
};
const normEmail = (e) => (/^\S+@\S+\.\S+$/.test(String(e ?? '').trim()) ? String(e).trim().toLowerCase() : undefined);
const addContact = (key, email, phone) => {
  const prev = contacts.get(key) ?? {};
  contacts.set(key, { email: email ?? prev.email, phone: phone ?? prev.phone });
};

// ---- 2. Past sign-up CSV ----
let signupAdded = [];
if (fs.existsSync(SIGNUP)) {
  const rows = toObjects(parseCsv(fs.readFileSync(SIGNUP, 'utf8')));
  for (const r of rows) {
    const given = fixCase(clean(r.givenName));
    const family = fixCase(clean(r.familyName));
    if (!given || !looksLikeName(given) || (family && !looksLikeName(family))) {
      if (given || family) console.warn(`  ! skipping unusable sign-up name: "${given} ${family}"`);
      continue;
    }
    const key = nameKey(given, family);
    if (EXCLUDE_NAMES.has(key)) continue;
    addContact(key, normEmail(r.email), normPhone(r.phoneNumber));
    if (byKey.has(key)) continue;
    const item = {
      personId: `su_${slug(key)}`,
      givenName: given,
      familyName: family,
      displayName: `${given} ${family}`.trim(),
      nameKey: key,
      source: 'signup2025',
      verified: true,
      createdAt: now,
    };
    byKey.set(key, item);
    items.push(item);
    signupAdded.push(item.displayName);
  }
} else {
  console.warn(`  ! sign-up CSV not found at ${SIGNUP}, skipping`);
}

// ---- 3. Cognito accounts (site sign-ins): newest contact info, plus names not listed yet ----
const accountAdded = [];
if (!SKIP_COGNITO) {
  const cog = new CognitoIdentityProviderClient({ region: 'us-east-1' });
  let PaginationToken;
  do {
    const out = await cog.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID, PaginationToken }));
    for (const u of out.Users ?? []) {
      const a = Object.fromEntries((u.Attributes ?? []).map((x) => [x.Name, x.Value]));
      const given = fixCase(clean(a.given_name));
      const family = fixCase(clean(a.family_name));
      if (!given || !looksLikeName(given) || (family && !looksLikeName(family))) continue;
      if (/^test$/i.test(given) || /^test$/i.test(family)) continue; // test accounts
      // "Lee Ann Enns" and "LeeAnn Enns" are the same person.
      const compact = nameKey(given, family).replace(/ /g, '');
      const match = [...byKey.values()].find((it) => it.nameKey.replace(/ /g, '') === compact);
      const key = match ? match.nameKey : nameKey(given, family);
      if (EXCLUDE_NAMES.has(key)) continue;
      addContact(key, normEmail(a.email), normPhone(a.phone_number));
      if (byKey.has(key)) continue;
      const item = {
        personId: `ac_${slug(key)}`,
        givenName: given,
        familyName: family,
        displayName: `${given} ${family}`.trim(),
        nameKey: key,
        source: 'account',
        verified: true,
        createdAt: now,
      };
      byKey.set(key, item);
      items.push(item);
      accountAdded.push(item.displayName);
    }
    PaginationToken = out.PaginationToken;
  } while (PaginationToken);
}

// Attach contacts only where the name is unambiguous (not e.g. the two Darrell Churchwells).
const keyCounts = new Map();
for (const it of items) keyCounts.set(it.nameKey, (keyCounts.get(it.nameKey) ?? 0) + 1);
let withContact = 0;
for (const it of items) {
  const c = contacts.get(it.nameKey);
  if (!c || keyCounts.get(it.nameKey) > 1 || it.deceased) continue;
  if (c.email) it.email = c.email;
  if (c.phone) it.phone = c.phone;
  if (c.email || c.phone) withContact++;
}

console.log(`Family tree: ${treeCount} people (${items.filter((i) => i.deceased).length} deceased, hidden from autocomplete), ${skippedBlank} blank rows skipped`);
console.log(`2025 sign-up: ${signupAdded.length} names not in the tree${signupAdded.length ? ':\n    ' + signupAdded.join(', ') : ''}`);
console.log(`Site accounts: ${accountAdded.length} names not listed yet${accountAdded.length ? ':\n    ' + accountAdded.join(', ') : ''}`);
console.log(`Contact info on file for ${withContact} people`);
console.log(`Total: ${items.length} → table ${TABLE}`);

if (DRY) {
  console.log('\n--dry-run: nothing written. Sample:');
  console.log(items.slice(0, 3).map(({ email, phone, ...rest }) => ({ ...rest, hasEmail: !!email, hasPhone: !!phone })));
  process.exit(0);
}

// ---- 3. Write (preserve verified/createdAt for existing items) ----
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true },
});

const existing = new Map();
let ExclusiveStartKey;
do {
  const out = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
  for (const it of out.Items ?? []) existing.set(it.personId, it);
  ExclusiveStartKey = out.LastEvaluatedKey;
} while (ExclusiveStartKey);

const TREE_FIELDS = ['inTree', 'motherId', 'fatherId', 'partnerIds', 'friendIds', 'gender', 'born', 'died', 'updatedAt', 'updatedBy'];
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const prev = existing.get(it.personId);
  if (!prev) continue;
  if (prev.inTree) {
    // The family tree is edited on the site now: keep the record exactly as it is,
    // only filling in contact details it doesn't have yet.
    items[i] = { ...prev, email: prev.email ?? it.email, phone: prev.phone ?? it.phone };
    continue;
  }
  it.createdAt = prev.createdAt ?? it.createdAt;
  if (typeof prev.verified === 'boolean') it.verified = prev.verified;
  // Keep contact info people gave at sign-up when the sources have none.
  if (!it.email && prev.email) it.email = prev.email;
  if (!it.phone && prev.phone) it.phone = prev.phone;
  for (const f of TREE_FIELDS) if (prev[f] !== undefined) it[f] = prev[f];
}

for (let i = 0; i < items.length; i += 25) {
  let req = { [TABLE]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
  for (let attempt = 0; req && Object.keys(req).length; attempt++) {
    const out = await doc.send(new BatchWriteCommand({ RequestItems: req }));
    req = out.UnprocessedItems && Object.keys(out.UnprocessedItems).length ? out.UnprocessedItems : null;
    if (req) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }
  process.stdout.write(`  wrote ${Math.min(i + 25, items.length)}/${items.length}\r`);
}
console.log(`\nDone. ${existing.size} items existed before.`);
