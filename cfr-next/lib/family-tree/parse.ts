import fs from 'node:fs';
import path from 'node:path';
import { ROOT_ID, type TreeData, type TreePerson } from './types';

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
const year = (s?: string) => {
  const n = parseInt(clean(s), 10);
  return Number.isFinite(n) && n > 1000 ? n : undefined;
};
const ids = (s?: string) => clean(s).split(/[\s;]+/).filter(Boolean);

/**
 * Reads the Family Echo export and returns only what the public tree needs.
 * Contact details, addresses, bios etc. are deliberately dropped.
 */
export function loadFamilyTree(file = path.join(process.cwd(), 'public', 'FamilyTree.html')): TreeData {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<INPUT TYPE="hidden" ID="csv" VALUE="([\s\S]*?)">/i);
  if (!m) throw new Error('No #csv block in FamilyTree.html');
  const [header, ...body] = parseCsv(decodeEntities(m[1]));
  const h = header.map((x) => x.trim());
  const rows = body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])) as Record<string, string>);

  const named = new Set(rows.filter((r) => clean(r['Given names'])).map((r) => r.ID));
  const people: TreePerson[] = [];
  for (const r of rows) {
    if (!named.has(r.ID)) continue; // blank placeholder rows
    const deceased = clean(r['Deceased']) === 'Y';
    const gender = clean(r['Gender']);
    const keep = (id?: string) => (id && named.has(id) ? id : undefined);
    const partnerIds = [r['Partner ID'], ...ids(r['Ex-partner IDs']), ...ids(r['Extra partner IDs'])]
      .map((x) => clean(x))
      .filter((x, i, a) => x && named.has(x) && a.indexOf(x) === i);
    people.push({
      id: r.ID,
      given: clean(r['Given names']),
      family: clean(r['Surname now']) || clean(r['Surname at birth']),
      nickname: clean(r['Nickname']) || undefined,
      gender: gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : undefined,
      deceased,
      born: deceased ? year(r['Birth year']) : undefined,
      died: deceased ? year(r['Death year']) : undefined,
      motherId: keep(clean(r['Mother ID'])),
      fatherId: keep(clean(r['Father ID'])),
      partnerIds,
    });
  }
  return { rootId: ROOT_ID, people };
}
