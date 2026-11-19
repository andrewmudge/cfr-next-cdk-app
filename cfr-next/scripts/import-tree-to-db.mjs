#!/usr/bin/env node
/**
 * ONE-TIME import: copies the family tree's relationships from the Family Echo export
 * (public/FamilyTree.html) into the FamilyMembers table. After this, the tree is edited
 * on the site (admin) and the table is the source of truth.
 *
 *   node scripts/import-tree-to-db.mjs --dry-run
 *   node scripts/import-tree-to-db.mjs
 *
 * Only tree fields are written (inTree, motherId, fatherId, partnerIds, friendIds, gender,
 * deceased, born, died). Existing names, contact info and `verified` are left alone.
 * Safe to re-run, but a re-run overwrites tree edits made on the site, so don't.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const DRY = process.argv.includes('--dry-run');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TABLE = process.env.FAMILY_MEMBERS_TABLE || 'FamilyMembers';

// Family Echo IDs whose tree spot belongs to a different FamilyMembers record.
const MERGE = { G51PX: 'ac_angela-jachetti' }; // Angela Mudge -> Angela Jachetti (same person)
const toId = (feId) => MERGE[feId] ?? `ft_${feId}`;

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const year = (s) => { const n = parseInt(clean(s), 10); return Number.isFinite(n) && n > 1000 ? n : undefined; };
const normalizeName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9\s'-]/g, ' ').replace(/['-]/g, '').replace(/\s+/g, ' ').trim();

const html = fs.readFileSync(path.join(ROOT, 'public', 'FamilyTree.html'), 'utf8');
const m = html.match(/<INPUT TYPE="hidden" ID="csv" VALUE="([\s\S]*?)">/i);
if (!m) throw new Error('No #csv block in FamilyTree.html');
const [header, ...body] = parseCsv(decode(m[1]));
const H = header.map((x) => x.trim());
const rows = body.map((r) => Object.fromEntries(H.map((k, i) => [k, r[i] ?? ''])));
const named = new Set(rows.filter((r) => clean(r['Given names'])).map((r) => r.ID));

const tree = [];
for (const r of rows) {
  if (!named.has(r.ID)) continue;
  const ref = (x) => (x && named.has(clean(x)) ? toId(clean(x)) : undefined);
  const partnerIds = [r['Partner ID'], ...clean(r['Ex-partner IDs']).split(/[\s;]+/), ...clean(r['Extra partner IDs']).split(/[\s;]+/)]
    .map(clean).filter((x, i, a) => x && named.has(x) && a.indexOf(x) === i).map(toId);
  const gender = clean(r['Gender']);
  const given = clean(r['Given names']);
  const family = clean(r['Surname now']) || clean(r['Surname at birth']);
  tree.push({
    personId: toId(r.ID),
    given, family,
    nickname: clean(r['Nickname']) || undefined,
    birthSurname: clean(r['Surname at birth']) || undefined,
    fields: {
      inTree: true,
      motherId: ref(r['Mother ID']),
      fatherId: ref(r['Father ID']),
      partnerIds: partnerIds.length ? partnerIds : undefined,
      gender: gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : undefined,
      deceased: clean(r['Deceased']) === 'Y' || undefined,
      born: year(r['Birth year']),
      died: year(r['Death year']),
    },
  });
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), { marshallOptions: { removeUndefinedValues: true } });
const existing = new Map();
let ExclusiveStartKey;
do {
  const out = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
  for (const it of out.Items ?? []) existing.set(it.personId, it);
  ExclusiveStartKey = out.LastEvaluatedKey;
} while (ExclusiveStartKey);

const missing = tree.filter((t) => !existing.has(t.personId));
const links = tree.reduce((n, t) => n + (t.fields.partnerIds?.length ?? 0), 0);
console.log(`Tree people: ${tree.length} (${tree.filter((t) => existing.has(t.personId)).length} already in FamilyMembers, ${missing.length} new)`);
console.log(`Parent links: ${tree.filter((t) => t.fields.motherId || t.fields.fatherId).length} people with parents; partner links: ${links}`);
for (const [fe, id] of Object.entries(MERGE)) {
  const t = tree.find((x) => x.personId === id);
  console.log(`Merge: Family Echo ${fe} -> ${id} (${existing.get(id)?.displayName ?? 'NOT FOUND'}); parents ${t?.fields.motherId}/${t?.fields.fatherId}; partners ${t?.fields.partnerIds}`);
  if (!existing.has(id)) throw new Error(`Merge target ${id} not in FamilyMembers`);
}
if (missing.length) console.log('New records:', missing.map((t) => `${t.given} ${t.family}`).join(', '));
if (DRY) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

let n = 0;
for (const t of tree) {
  const fields = t.fields;
  if (!existing.has(t.personId)) {
    await doc.send(new PutCommand({
      TableName: TABLE,
      Item: {
        personId: t.personId, givenName: t.given, familyName: t.family, displayName: `${t.given} ${t.family}`.trim(),
        nameKey: normalizeName(`${t.given} ${t.family}`), nickname: t.nickname, birthSurname: t.birthSurname,
        source: 'familytree', verified: true, createdAt: new Date().toISOString(), ...fields,
      },
      ConditionExpression: 'attribute_not_exists(personId)',
    }));
  } else {
    const set = []; const remove = []; const names = {}; const values = {};
    Object.entries({ ...fields, friendIds: undefined }).forEach(([k, v], i) => {
      names[`#f${i}`] = k;
      if (v === undefined) remove.push(`#f${i}`);
      else { set.push(`#f${i} = :v${i}`); values[`:v${i}`] = v; }
    });
    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { personId: t.personId },
      UpdateExpression: `SET ${set.join(', ')}${remove.length ? ` REMOVE ${remove.join(', ')}` : ''}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }
  process.stdout.write(`  ${++n}/${tree.length}\r`);
}
console.log(`\nDone. ${tree.length} people are now in the tree.`);
