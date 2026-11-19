import type { FamilyGraph } from './graph';

export interface Relationship {
  /** e.g. "Sarah Churchwell is Jake Allen's 2nd cousin, once removed" */
  text: string;
  /** Short form, e.g. "2nd cousin, once removed" */
  label: string;
  kind: 'self' | 'blood' | 'partner' | 'friend' | 'in-law' | 'marriage' | 'none';
  /** People along the connection, A → … → B, for highlighting. */
  pathIds: string[];
  /** Best person to center the tree on so the whole path is visible. */
  focusId?: string;
}

type Depths = Map<string, { d: number; prev: string | null }>;

function ancestorDepths(g: FamilyGraph, id: string): Depths {
  const m: Depths = new Map([[id, { d: 0, prev: null }]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = m.get(cur)!.d;
    for (const p of g.parentsOf(cur)) {
      if (!m.has(p)) {
        m.set(p, { d: d + 1, prev: cur });
        queue.push(p);
      }
    }
  }
  return m;
}

const climb = (m: Depths, top: string) => {
  const path: string[] = [];
  for (let cur: string | null = top; cur; cur = m.get(cur)?.prev ?? null) path.push(cur);
  return path; // top … self
};

interface Blood {
  dA: number;
  dB: number;
  common: string;
  half: boolean;
  path: string[];
}

function blood(g: FamilyGraph, a: string, b: string): Blood | null {
  const ma = ancestorDepths(g, a);
  const mb = ancestorDepths(g, b);
  let best: { c: string; dA: number; dB: number } | null = null;
  for (const [c, { d: dA }] of ma) {
    const hit = mb.get(c);
    if (!hit) continue;
    const dB = hit.d;
    if (!best || dA + dB < best.dA + best.dB || (dA + dB === best.dA + best.dB && Math.max(dA, dB) < Math.max(best.dA, best.dB))) {
      best = { c, dA, dB };
    }
  }
  if (!best) return null;
  // Half relations: only one of the two ancestors at that level is shared.
  const sharedAtLevel = [...ma].filter(([c, v]) => v.d === best!.dA && mb.get(c)?.d === best!.dB).length;
  const half = best.dA > 0 && best.dB > 0 && sharedAtLevel < 2;
  const upA = climb(ma, best.c).reverse(); // a … c
  const upB = climb(mb, best.c); // c … b
  return { ...best, common: best.c, half, path: [...upA, ...upB.slice(1)] };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const greats = (n: number) => 'great-'.repeat(Math.max(0, n));

/** What B is to A, given generations up from each to their closest shared ancestor. */
export function bloodLabel(dA: number, dB: number, genderB: 'M' | 'F' | undefined, half = false): string {
  const w = (m: string, f: string, n: string) => (genderB === 'M' ? m : genderB === 'F' ? f : n);
  if (dA === 0 && dB === 0) return 'the same person';
  if (dA === 0) {
    const base = w('son', 'daughter', 'child');
    return dB === 1 ? base : `${greats(dB - 2)}grand${base}`;
  }
  if (dB === 0) {
    const base = w('father', 'mother', 'parent');
    return dA === 1 ? base : `${greats(dA - 2)}grand${base}`;
  }
  if (dA === 1 && dB === 1) return `${half ? 'half-' : ''}${w('brother', 'sister', 'sibling')}`;
  if (dA === 1) {
    const base = w('nephew', 'niece', 'niece/nephew');
    return dB === 2 ? base : `${greats(dB - 3)}grand${base}`;
  }
  if (dB === 1) {
    const base = w('uncle', 'aunt', 'aunt/uncle');
    return dA === 2 ? base : `${greats(dA - 2)}${base}`;
  }
  const degree = Math.min(dA, dB) - 1;
  const removed = Math.abs(dA - dB);
  return `${ordinal(degree)} cousin${removed ? `, ${times(removed)} removed` : ''}`;
}

const partnerWord = (g: FamilyGraph, a: string, b: string) => {
  const gender = g.get(b)?.gender;
  if (!g.isCurrentPartner(a, b)) return 'former partner';
  return gender === 'M' ? 'husband' : gender === 'F' ? 'wife' : 'partner';
};

// B is a blood relative of A's partner.
const viaPartner: Record<string, string> = {
  father: 'father-in-law', mother: 'mother-in-law', parent: 'parent-in-law',
  brother: 'brother-in-law', sister: 'sister-in-law', sibling: 'sibling-in-law',
  son: 'stepson', daughter: 'stepdaughter', child: 'stepchild',
};
// B is the partner of A's blood relative (keyed by what B would be called, using B's gender).
const viaRelativesPartner: Record<string, string> = {
  father: 'stepfather', mother: 'stepmother', parent: 'step-parent',
  brother: 'brother-in-law', sister: 'sister-in-law', sibling: 'sibling-in-law',
  son: 'son-in-law', daughter: 'daughter-in-law', child: 'child-in-law',
};

/** Describe how person B is related to person A. */
export function relate(g: FamilyGraph, a: string, b: string): Relationship {
  const A = g.name(a);
  const B = g.name(b);
  if (a === b) return { text: `That's the same person.`, label: 'same person', kind: 'self', pathIds: [a], focusId: a };

  const direct = blood(g, a, b);
  if (direct) {
    const label = bloodLabel(direct.dA, direct.dB, g.get(b)?.gender, direct.half);
    return { text: `${B} is ${A}'s ${label}.`, label, kind: 'blood', pathIds: direct.path, focusId: direct.common };
  }

  if (g.friendsOf(a).includes(b)) {
    return { text: `${B} is ${A}'s friend.`, label: 'friend', kind: 'friend', pathIds: [a, b], focusId: a };
  }

  if (g.partnersOf(a).includes(b)) {
    const label = partnerWord(g, a, b);
    return { text: `${B} is ${A}'s ${label}.`, label, kind: 'partner', pathIds: [a, b], focusId: a };
  }

  // Through a partner: B is A's partner's relative, or B is married to A's relative.
  type Cand = { score: number; rel: Relationship };
  const cands: Cand[] = [];
  for (const p of g.partnersOf(a)) {
    const r = blood(g, p, b);
    if (!r) continue;
    const base = bloodLabel(r.dA, r.dB, g.get(b)?.gender, r.half);
    const label = viaPartner[base] ?? `${partnerWord(g, a, p)}'s ${base}`;
    cands.push({
      score: r.dA + r.dB,
      rel: { text: `${B} is ${A}'s ${label}.`, label, kind: 'in-law', pathIds: [a, ...r.path], focusId: r.common },
    });
  }
  for (const q of g.partnersOf(b)) {
    const r = blood(g, a, q);
    if (!r) continue;
    const base = bloodLabel(r.dA, r.dB, g.get(q)?.gender, r.half); // what q is to A
    const asB = bloodLabel(r.dA, r.dB, g.get(b)?.gender, r.half); // same relation, B's gender
    const named = viaRelativesPartner[asB];
    const label = named ?? `${base}'s ${partnerWord(g, q, b)}`;
    const text = named ? `${B} is ${A}'s ${named}.` : `${B} is married to ${A}'s ${base}, ${g.name(q)}.`;
    cands.push({ score: r.dA + r.dB, rel: { text, label, kind: 'in-law', pathIds: [...r.path, b], focusId: r.common } });
  }
  if (cands.length) return cands.sort((x, y) => x.score - y.score)[0].rel;

  // Fallback: shortest chain through parents, children and partners.
  const prev = new Map<string, string | null>([[a, null]]);
  const queue = [a];
  while (queue.length && !prev.has(b)) {
    const cur = queue.shift()!;
    for (const n of [...g.parentsOf(cur), ...g.childrenOf(cur), ...g.partnersOf(cur)]) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        queue.push(n);
      }
    }
  }
  if (!prev.has(b)) return { text: `${A} and ${B} aren't connected in the tree yet.`, label: 'not connected', kind: 'none', pathIds: [] };
  const path: string[] = [];
  for (let cur: string | null = b; cur; cur = prev.get(cur) ?? null) path.push(cur);
  path.reverse();
  return {
    text: `${A} and ${B} are family by marriage (${path.length - 1} steps apart).`,
    label: 'family by marriage',
    kind: 'marriage',
    pathIds: path,
    focusId: a,
  };
}
