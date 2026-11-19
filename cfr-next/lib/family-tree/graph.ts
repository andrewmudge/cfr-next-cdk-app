import type { TreeData, TreePerson } from './types';

/** Indexes the flat person list for fast family lookups (parents, children, partners, branches). */
export class FamilyGraph {
  readonly rootId: string;
  readonly people: TreePerson[];
  private byId = new Map<string, TreePerson>();
  private kids = new Map<string, string[]>();
  private partnerMap = new Map<string, string[]>();
  private friendMap = new Map<string, string[]>();
  /** Index of the root couple's child each descendant comes through (their "branch"). */
  private branch = new Map<string, number>();
  readonly branchHeads: string[];
  private dupeHint = new Map<string, string>();

  constructor(data: TreeData) {
    this.rootId = data.rootId;
    this.people = data.people;
    for (const p of data.people) this.byId.set(p.id, p);

    for (const p of data.people) {
      for (const parent of [p.fatherId, p.motherId]) {
        if (parent && this.byId.has(parent)) this.kids.set(parent, [...(this.kids.get(parent) ?? []), p.id]);
      }
      // Partner links are symmetric even if only one side lists the other.
      for (const q of p.partnerIds) {
        if (!this.byId.has(q)) continue;
        this.addPartner(p.id, q);
        this.addPartner(q, p.id);
      }
      for (const q of p.friendIds ?? []) {
        if (!this.byId.has(q)) continue;
        for (const [x, y] of [[p.id, q], [q, p.id]]) {
          const list = this.friendMap.get(x) ?? [];
          if (!list.includes(y)) this.friendMap.set(x, [...list, y]);
        }
      }
    }
    // Stable order: eldest first where birth years are known, then by name.
    const born = (id: string) => this.byId.get(id)?.born ?? Number.MAX_SAFE_INTEGER;
    for (const [parent, list] of this.kids) {
      this.kids.set(parent, [...list].sort((x, y) => born(x) - born(y) || this.name(x).localeCompare(this.name(y))));
    }

    // Co-parents count as partners for layout purposes.
    for (const p of data.people) {
      if (p.fatherId && p.motherId) {
        this.addPartner(p.fatherId, p.motherId);
        this.addPartner(p.motherId, p.fatherId);
      }
    }

    // Branches: each child of the root couple starts a branch.
    this.branchHeads = this.childrenOf(this.rootId);
    this.branchHeads.forEach((head, i) => {
      const stack = [head];
      while (stack.length) {
        const id = stack.pop()!;
        if (this.branch.has(id)) continue;
        this.branch.set(id, i);
        stack.push(...this.childrenOf(id));
      }
    });

    // Same-name people get a "child of …" hint so they can be told apart.
    const counts = new Map<string, number>();
    for (const p of data.people) counts.set(this.name(p.id), (counts.get(this.name(p.id)) ?? 0) + 1);
    for (const p of data.people) {
      if ((counts.get(this.name(p.id)) ?? 0) < 2) continue;
      const parents = this.parentsOf(p.id).map((id) => this.get(id)?.given).filter(Boolean);
      if (parents.length) this.dupeHint.set(p.id, `child of ${parents.join(' & ')}`);
    }
  }

  private addPartner(a: string, b: string) {
    const list = this.partnerMap.get(a) ?? [];
    if (!list.includes(b)) this.partnerMap.set(a, [...list, b]);
  }

  get(id: string) {
    return this.byId.get(id);
  }
  has(id: string) {
    return this.byId.has(id);
  }
  name(id: string) {
    const p = this.byId.get(id);
    return p ? `${p.given} ${p.family}`.trim() : 'Unknown';
  }
  hint(id: string) {
    return this.dupeHint.get(id);
  }
  parentsOf(id: string): string[] {
    const p = this.byId.get(id);
    return [p?.fatherId, p?.motherId].filter((x): x is string => !!x && this.byId.has(x));
  }
  childrenOf(id: string): string[] {
    return this.kids.get(id) ?? [];
  }
  partnersOf(id: string): string[] {
    return this.partnerMap.get(id) ?? [];
  }
  /** Friends are shown in the tree but aren't family links. */
  friendsOf(id: string): string[] {
    return (this.friendMap.get(id) ?? []).filter((f) => !this.partnersOf(id).includes(f));
  }
  /** The partner listed first by the person themselves (their current partner). */
  isCurrentPartner(a: string, b: string) {
    return this.byId.get(a)?.partnerIds[0] === b || this.byId.get(b)?.partnerIds[0] === a;
  }
  siblingsOf(id: string): string[] {
    const set = new Set<string>();
    for (const parent of this.parentsOf(id)) for (const k of this.childrenOf(parent)) if (k !== id) set.add(k);
    return [...set];
  }
  branchOf(id: string): number | undefined {
    return this.branch.get(id);
  }
  isRootCouple(id: string) {
    return id === this.rootId || this.partnersOf(this.rootId).includes(id);
  }

  /** Path from a person up to the root (or their top-most ancestor): [person, parent, …, top]. */
  lineToTop(id: string): string[] {
    const prev = new Map<string, string | null>([[id, null]]);
    const queue = [id];
    let end = id;
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === this.rootId) {
        end = cur;
        break;
      }
      const parents = this.parentsOf(cur);
      if (!parents.length && end === id) end = cur;
      for (const p of parents) {
        if (!prev.has(p)) {
          prev.set(p, cur);
          queue.push(p);
        }
      }
    }
    if (!prev.has(this.rootId)) {
      // Not a descendant of the root: climb fathers first, then mothers, as far as possible.
      let cur = id;
      for (;;) {
        const next = this.parentsOf(cur)[0];
        if (!next || prev.get(next) !== cur) break;
        cur = next;
      }
      end = cur;
    }
    const path: string[] = [];
    for (let cur: string | null = end; cur; cur = prev.get(cur) ?? null) path.push(cur);
    return path.reverse();
  }
}
