import { randomUUID } from 'crypto';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  docClient,
  MEMBERS_TABLE,
  invalidateMembersCache,
  listFamilyMemberRecords,
  type FamilyMemberRecord,
} from '@/lib/reunion-db';
import { nameKey, titleCase } from '@/lib/reunion-config';
import { ROOT_ID, type TreeData, type TreePerson } from './types';

// ---------- Reading ----------

let treeCache: { at: number; data: TreeData } | null = null;
const TREE_CACHE_MS = 15_000;

/** Public, contact-free tree built from the FamilyMembers table (people with inTree). */
export async function loadTreeData(): Promise<TreeData> {
  if (treeCache && Date.now() - treeCache.at < TREE_CACHE_MS) return treeCache.data;
  const all = await listFamilyMemberRecords(true);
  const inTree = all.filter((m) => m.inTree);
  const ids = new Set(inTree.map((m) => m.personId));
  const keep = (id?: string) => (id && ids.has(id) ? id : undefined);
  const people: TreePerson[] = inTree.map((m) => ({
    id: m.personId,
    given: m.givenName,
    family: m.familyName,
    nickname: m.nickname || undefined,
    gender: m.gender,
    deceased: !!m.deceased,
    // Years are only shown publicly for people who have passed.
    born: m.deceased ? m.born : undefined,
    died: m.deceased ? m.died : undefined,
    motherId: keep(m.motherId),
    fatherId: keep(m.fatherId),
    partnerIds: (m.partnerIds ?? []).filter((x) => ids.has(x)),
    friendIds: (m.friendIds ?? []).filter((x) => ids.has(x)),
  }));
  const data = { rootId: ROOT_ID, people };
  treeCache = { at: Date.now(), data };
  return data;
}

const invalidate = () => {
  treeCache = null;
  invalidateMembersCache();
};

// ---------- Editing (admin only; routes check auth) ----------

export class TreeEditError extends Error {}

type Members = Map<string, FamilyMemberRecord>;

async function fresh(): Promise<Members> {
  const all = await listFamilyMemberRecords(true);
  return new Map(all.map((m) => [m.personId, m]));
}

function need(members: Members, id: string, what = 'That person') {
  const m = members.get(id);
  if (!m) throw new TreeEditError(`${what} wasn't found.`);
  return m;
}

/** Collects field changes per person and writes them in one all-or-nothing transaction. */
class Batch {
  private sets = new Map<string, Record<string, unknown>>();
  private removes = new Map<string, Set<string>>();
  private puts: FamilyMemberRecord[] = [];
  constructor(private by: string) {}

  set(id: string, fields: Record<string, unknown>) {
    const cur = this.sets.get(id) ?? {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null || v === '') {
        delete cur[k];
        this.removes.set(id, (this.removes.get(id) ?? new Set()).add(k));
      } else {
        cur[k] = v;
        this.removes.get(id)?.delete(k);
      }
    }
    this.sets.set(id, cur);
  }
  put(item: FamilyMemberRecord) {
    this.puts.push(item);
  }

  async commit() {
    const now = new Date().toISOString();
    // New people are written whole, including any links set on them in this batch.
    const items: Record<string, unknown>[] = this.puts.map((p) => ({
      Put: {
        TableName: MEMBERS_TABLE,
        Item: { ...p, ...(this.sets.get(p.personId) ?? {}) },
        ConditionExpression: 'attribute_not_exists(personId)',
      },
    }));
    const ids = new Set([...this.sets.keys(), ...this.removes.keys()]);
    for (const id of ids) {
      if (this.puts.some((p) => p.personId === id)) continue;
      const fields = { ...(this.sets.get(id) ?? {}), updatedAt: now, updatedBy: this.by };
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = {};
      const setParts = Object.entries(fields).map(([k, v], i) => {
        names[`#s${i}`] = k;
        values[`:s${i}`] = v;
        return `#s${i} = :s${i}`;
      });
      const removeParts = [...(this.removes.get(id) ?? [])].map((k, i) => {
        names[`#r${i}`] = k;
        return `#r${i}`;
      });
      items.push({
        Update: {
          TableName: MEMBERS_TABLE,
          Key: { personId: id },
          UpdateExpression: `SET ${setParts.join(', ')}${removeParts.length ? ` REMOVE ${removeParts.join(', ')}` : ''}`,
          ConditionExpression: 'attribute_exists(personId)',
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        },
      });
    }
    if (!items.length) return;
    if (items.length > 100) throw new TreeEditError('That change touches too many people at once.');
    await docClient.send(new TransactWriteCommand({ TransactItems: items }));
    invalidate();
  }
}

const uniq = (xs: string[]) => [...new Set(xs)];

function ancestorsOf(members: Members, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const m = members.get(stack.pop()!);
    for (const p of [m?.motherId, m?.fatherId]) {
      if (p && !out.has(p)) {
        out.add(p);
        stack.push(p);
      }
    }
  }
  return out;
}

/** Puts `parent` into a free mother/father slot of `child` (by gender where known). */
function addParent(members: Members, b: Batch, parentId: string, childId: string, pending: Record<string, Partial<FamilyMemberRecord>> = {}) {
  if (parentId === childId) throw new TreeEditError("Someone can't be their own parent.");
  const child = { ...need(members, childId), ...(pending[childId] ?? {}) };
  const parent = { ...need(members, parentId), ...(pending[parentId] ?? {}) };
  if (child.motherId === parentId || child.fatherId === parentId) return;
  if (childId === parentId || ancestorsOf(members, parentId).has(childId)) {
    throw new TreeEditError(`${child.displayName} is already an ancestor of ${parent.displayName}.`);
  }
  let slot: 'motherId' | 'fatherId' | undefined;
  if (parent.gender === 'F') slot = child.motherId ? undefined : 'motherId';
  else if (parent.gender === 'M') slot = child.fatherId ? undefined : 'fatherId';
  else slot = !child.fatherId ? 'fatherId' : !child.motherId ? 'motherId' : undefined;
  if (!slot) throw new TreeEditError(`${child.displayName} already has a ${parent.gender === 'F' ? 'mother' : parent.gender === 'M' ? 'father' : 'mother and father'}.`);
  b.set(childId, { [slot]: parentId, inTree: true });
  pending[childId] = { ...(pending[childId] ?? {}), [slot]: parentId };
}

function linkPair(members: Members, b: Batch, field: 'partnerIds' | 'friendIds', a: string, c: string, front = false) {
  if (a === c) throw new TreeEditError("Someone can't be linked to themselves.");
  for (const [x, y] of [[a, c], [c, a]]) {
    const cur = need(members, x)[field] ?? [];
    const next = front ? uniq([y, ...cur]) : uniq([...cur, y]);
    b.set(x, { [field]: next, inTree: true });
    members.set(x, { ...need(members, x), [field]: next });
  }
}

function unlinkPair(members: Members, b: Batch, field: 'partnerIds' | 'friendIds', a: string, c: string) {
  for (const [x, y] of [[a, c], [c, a]]) {
    const cur = need(members, x)[field] ?? [];
    const next = cur.filter((id) => id !== y);
    b.set(x, { [field]: next.length ? next : undefined });
    members.set(x, { ...need(members, x), [field]: next });
  }
}

export interface PersonDetails {
  given: string;
  family: string;
  nickname?: string;
  gender?: 'M' | 'F';
  deceased?: boolean;
  born?: number;
  died?: number;
}

const nameFields = (d: PersonDetails) => {
  const given = titleCase(d.given.trim().replace(/\s+/g, ' '));
  const family = titleCase(d.family.trim().replace(/\s+/g, ' '));
  return { givenName: given, familyName: family, displayName: `${given} ${family}`.trim(), nameKey: nameKey(given, family) };
};

export async function updatePerson(id: string, d: PersonDetails, by: string) {
  const members = await fresh();
  need(members, id);
  const b = new Batch(by);
  b.set(id, {
    ...nameFields(d),
    nickname: d.nickname?.trim() || undefined,
    gender: d.gender,
    deceased: d.deceased || undefined,
    // Living people's years are never sent to the browser, so the form can't show them;
    // only change stored years when the person is marked as passed away.
    ...(d.deceased ? { born: d.born, died: d.died } : {}),
  });
  await b.commit();
}

export type Relation = 'child' | 'parent' | 'partner' | 'friend' | 'sibling';

export async function addRelative(
  input: { relation: Relation; of: string; existingId?: string; newPerson?: PersonDetails; otherParentId?: string },
  by: string
): Promise<string> {
  const members = await fresh();
  const of = need(members, input.of);
  const b = new Batch(by);

  let id: string;
  if (input.existingId) {
    id = need(members, input.existingId).personId;
    if (id === of.personId) throw new TreeEditError("Someone can't be linked to themselves.");
    b.set(id, { inTree: true });
  } else if (input.newPerson) {
    id = `tr_${randomUUID().slice(0, 8)}`;
    const rec: FamilyMemberRecord = {
      personId: id,
      ...nameFields(input.newPerson),
      nickname: input.newPerson.nickname?.trim() || undefined,
      gender: input.newPerson.gender,
      deceased: input.newPerson.deceased || undefined,
      born: input.newPerson.born,
      died: input.newPerson.died,
      source: 'tree',
      verified: true,
      inTree: true,
      createdAt: new Date().toISOString(),
      updatedBy: by,
    };
    if (!rec.givenName) throw new TreeEditError('Please enter a first name.');
    members.set(id, rec);
    b.put(rec);
  } else {
    throw new TreeEditError('Pick a person or enter a new name.');
  }
  b.set(of.personId, { inTree: true });

  const pending: Record<string, Partial<FamilyMemberRecord>> = {};
  switch (input.relation) {
    case 'child': {
      addParent(members, b, of.personId, id, pending);
      if (input.otherParentId) addParent(members, b, input.otherParentId, id, pending);
      break;
    }
    case 'parent':
      addParent(members, b, id, of.personId, pending);
      break;
    case 'partner':
      linkPair(members, b, 'partnerIds', of.personId, id, !(of.partnerIds ?? []).length);
      break;
    case 'friend':
      linkPair(members, b, 'friendIds', of.personId, id);
      break;
    case 'sibling': {
      const parents = [of.fatherId, of.motherId].filter((x): x is string => !!x);
      if (!parents.length) throw new TreeEditError(`Add a parent for ${of.displayName} first, then add siblings.`);
      for (const p of parents) addParent(members, b, p, id, pending);
      break;
    }
  }

  await b.commit();
  return id;
}

export type LinkType = 'parent' | 'partner' | 'friend';

/** a = parent / one partner / one friend; b = child / other partner / other friend. */
export async function link(type: LinkType, a: string, c: string, by: string, opts: { current?: boolean } = {}) {
  const members = await fresh();
  const b = new Batch(by);
  if (type === 'parent') addParent(members, b, a, c);
  else if (type === 'partner') {
    // Moving between friend and partner is a single step.
    if ((need(members, a).friendIds ?? []).includes(c)) unlinkPair(members, b, 'friendIds', a, c);
    linkPair(members, b, 'partnerIds', a, c, !!opts.current);
  } else {
    if ((need(members, a).partnerIds ?? []).includes(c)) unlinkPair(members, b, 'partnerIds', a, c);
    linkPair(members, b, 'friendIds', a, c);
  }
  await b.commit();
}

export async function unlink(type: LinkType, a: string, c: string, by: string) {
  const members = await fresh();
  const b = new Batch(by);
  if (type === 'parent') {
    const child = need(members, c);
    if (child.motherId === a) b.set(c, { motherId: undefined });
    else if (child.fatherId === a) b.set(c, { fatherId: undefined });
    else throw new TreeEditError("They aren't linked as parent and child.");
  } else {
    unlinkPair(members, b, type === 'partner' ? 'partnerIds' : 'friendIds', a, c);
  }
  await b.commit();
}

/** Takes someone out of the tree and unlinks them everywhere. Their sign-up name/registrations stay. */
export async function removeFromTree(id: string, by: string) {
  if (id === ROOT_ID) throw new TreeEditError("Patrick is the top of the tree and can't be removed.");
  const members = await fresh();
  const person = need(members, id);
  const b = new Batch(by);
  for (const m of members.values()) {
    if (m.personId === id) continue;
    const fields: Record<string, unknown> = {};
    if (m.motherId === id) fields.motherId = undefined;
    if (m.fatherId === id) fields.fatherId = undefined;
    if (m.partnerIds?.includes(id)) {
      const next = m.partnerIds.filter((x) => x !== id);
      fields.partnerIds = next.length ? next : undefined;
    }
    if (m.friendIds?.includes(id)) {
      const next = m.friendIds.filter((x) => x !== id);
      fields.friendIds = next.length ? next : undefined;
    }
    if (Object.keys(fields).length) b.set(m.personId, fields);
  }
  b.set(person.personId, {
    inTree: false,
    motherId: undefined,
    fatherId: undefined,
    partnerIds: undefined,
    friendIds: undefined,
  });
  await b.commit();
}
