import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy';
import type { FamilyGraph } from './graph';

export const CARD_W = 146;
export const CARD_H = 68;
const PARTNER_GAP = 14;
const SIBLING_GAP = 20;
const COUSIN_GAP = 40;
const TREE_GAP = 140;
const ROW_H = 150;
const PAD = 60;

export interface CardPos {
  id: string;
  x: number; // top-left
  y: number;
  /** Drawn as someone's partner rather than as a blood child in this view. */
  asPartner?: boolean;
  /** Drawn as someone's friend (far side, lighter link). */
  asFriend?: boolean;
}

export interface LinkPos {
  key: string;
  d: string; // SVG path
  childId: string;
  parentIds: string[];
  /** Partner connector (between two cards in a couple). */
  couple?: boolean;
  /** Friend connector (lighter). */
  friend?: boolean;
  /** Long connector between two separately drawn family trees. */
  cross?: boolean;
}

export interface TreeLayout {
  cards: CardPos[];
  links: LinkPos[];
  width: number;
  height: number;
}

interface Unit {
  person: string;
  /** Left-to-right card order, e.g. [friend, person, spouse]. */
  order: string[];
  friends: Set<string>;
  children: Unit[];
  /** Placeholder that reserves room in a parent tree for another family's tree (no cards). */
  space?: { tree: number; width: number };
}

const unitWidth = (u: Unit) => (u.space ? u.space.width : u.order.length * CARD_W + (u.order.length - 1) * PARTNER_GAP);

/** Rounded elbow connector from (x1,y1) down to (x2,y2). */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const ym = y1 + (y2 - y1) / 2;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} V${y2}`;
  const r = Math.min(12, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 4);
  const dir = x2 > x1 ? 1 : -1;
  return [`M${x1},${y1}`, `V${ym - r}`, `Q${x1},${ym} ${x1 + dir * r},${ym}`, `H${x2 - dir * r}`, `Q${x2},${ym} ${x2},${ym + r}`, `V${y2}`].join(' ');
}

/** Smooth curve between two points, for links that jump between family trees. */
function curve(x1: number, y1: number, x2: number, y2: number, sag: number): string {
  return `M${x1},${y1} C${x1},${y1 + sag} ${x2},${y2 + (y2 >= y1 ? -sag : sag)} ${x2},${y2}`;
}

/**
 * The whole family on one canvas. Patrick's tree is built first; every other connected
 * family (in-laws, friends' families) is built as its own tree from its eldest ancestors,
 * placed beside the trees it connects to with generations lined up, and joined to them
 * by curved connectors. Everyone appears exactly once.
 */
export function layoutTree(g: FamilyGraph): TreeLayout {
  const placed = new Set<string>();
  const sharedKids = (a: string, b: string) => g.childrenOf(a).filter((k) => g.parentsOf(k).includes(b)).length;
  const free = (ids: string[]) => ids.filter((x) => !placed.has(x));

  const build = (person: string): Unit => {
    placed.add(person);
    const partners = free(g.partnersOf(person));
    partners.forEach((p) => placed.add(p));
    const friends = free(g.friendsOf(person));
    friends.forEach((f) => placed.add(f));

    // Spouse directly to the right (co-parent, else current partner); other partners, then
    // friends, on the left. Each of them brings their own other partners along, further out.
    const coParents = partners.filter((p) => sharedKids(person, p) > 0).sort((a, b) => sharedKids(person, b) - sharedKids(person, a));
    const current = partners.find((p) => g.isCurrentPartner(person, p));
    const spouse = coParents[0] ?? current ?? partners[0];
    const rank = (p: string) => (p === current ? 0 : coParents.includes(p) ? 1 : 2);
    const others = partners.filter((p) => p !== spouse).sort((a, b) => rank(a) - rank(b));
    // Follow partners down the chain (e.g. Rick -> his partner Frank -> Frank's wife Toni),
    // so each couple stays side by side instead of being drawn as separate families.
    const withTheirPartners = (s: string) => {
      const chain = [s];
      for (let i = 0; i < chain.length; i++) {
        for (const x of free(g.partnersOf(chain[i]))) {
          placed.add(x);
          chain.push(x);
        }
      }
      return chain;
    };
    const right = spouse ? withTheirPartners(spouse) : [];
    const left = [...others, ...friends].flatMap(withTheirPartners); // nearest first
    const order = [...left.reverse(), person, ...right];

    // Children of anyone in the group, ordered by where their parents sit.
    const pos = new Map(order.map((id, i) => [id, i]));
    const kids = [...new Set(order.flatMap((m) => free(g.childrenOf(m))))].sort((a, b) => {
      const pa = Math.min(...g.parentsOf(a).map((p) => pos.get(p) ?? 99));
      const pb = Math.min(...g.parentsOf(b).map((p) => pos.get(p) ?? 99));
      return pa - pb;
    });
    const children: Unit[] = [];
    for (const k of kids) if (!placed.has(k)) children.push(build(k));
    return { person, order, friends: new Set(friends), children };
  };

  // Trees: Patrick's first, then each remaining family from its eldest ancestor.
  const roots: Unit[] = [build(g.rootId)];
  const descCount = (id: string) => {
    const s = new Set<string>();
    const walk = (i: string) => {
      for (const k of g.childrenOf(i)) {
        if (!s.has(k)) {
          s.add(k);
          walk(k);
        }
      }
    };
    walk(id);
    return s.size;
  };
  for (;;) {
    const heads = g.people.map((p) => p.id).filter((id) => !placed.has(id) && free(g.parentsOf(id)).length === 0);
    if (!heads.length) break;
    heads.sort((a, b) => descCount(b) - descCount(a));
    roots.push(build(heads[0]));
  }

  const cards: CardPos[] = [];
  const at = new Map<string, CardPos>();
  type Raw = Omit<LinkPos, 'd'> & { pts: [number, number, number, number]; kind: 'elbow' | 'line' | 'curve' };
  const raw: Raw[] = [];
  const drawn = new Set<string>(); // "parent>child" and "a~b" pairs that already have a connector

  type Local = { id: string; x: number; y: number; unit: Unit };
  const layoutOne = (rootUnit: Unit) => {
    const laid = tree<Unit>()
      .nodeSize([1, ROW_H])
      .separation((a, b) => (unitWidth(a.data) + unitWidth(b.data)) / 2 + (a.parent === b.parent ? SIBLING_GAP : COUSIN_GAP))(
      hierarchy(rootUnit, (u) => u.children)
    );
    const local: Local[] = [];
    laid.each((node: HierarchyPointNode<Unit>) => {
      const u = node.data;
      if (u.space) return;
      const left = node.x - unitWidth(u) / 2;
      u.order.forEach((id, i) => local.push({ id, x: left + i * (CARD_W + PARTNER_GAP), y: node.y, unit: u }));
    });
    const lx = Math.min(...local.map((c) => c.x));
    const rx = Math.max(...local.map((c) => c.x + CARD_W));
    const rows = Math.round(Math.max(...local.map((c) => c.y)) / ROW_H) + 1;
    return { laid, local, lx, rx, rows };
  };

  // Families that married in below Patrick's children (e.g. Sheryl's family, the Olsens)
  // get room reserved right next to their spouse's branch, with their parents one row
  // above them, instead of being drawn off to the side with a long connector.
  const unitOf = new Map<string, Unit>();
  const parentUnit = new Map<Unit, Unit>();
  const index = (u: Unit) => {
    u.order.forEach((id) => unitOf.set(id, u));
    for (const c of u.children) {
      parentUnit.set(c, u);
      index(c);
    }
  };
  index(roots[0]);
  const pre = roots.map((r, ti) => (ti ? layoutOne(r) : null));
  const insertedAt = new Map<number, Unit>(); // tree index -> its space placeholder in the main tree
  roots.forEach((r, ti) => {
    if (!ti) return;
    const ids = new Set(pre[ti]!.local.map((c) => c.id));
    // A child of this family who sits in the main tree (as someone's partner).
    const child = [...ids].flatMap((id) => g.childrenOf(id)).find((k) => !ids.has(k) && unitOf.has(k));
    if (!child) return;
    const u = unitOf.get(child)!;
    const parent = parentUnit.get(u);
    if (!parent || parent === roots[0]) return; // e.g. Cecil's family stays to the side
    const width = pre[ti]!.rx - pre[ti]!.lx;
    // A chain of placeholders reserves the width on every row the family uses.
    let chain: Unit[] = [];
    for (let d = pre[ti]!.rows - 2; d > 0; d--) {
      chain = [{ person: `__space${ti}_${d}`, order: [], friends: new Set(), children: chain, space: { tree: ti, width } }];
    }
    const space: Unit = { person: `__space${ti}`, order: [], friends: new Set(), children: chain, space: { tree: ti, width } };
    parent.children.splice(parent.children.indexOf(u) + 1, 0, space);
    insertedAt.set(ti, space);
  });

  // Lay out each tree, then place it: inserted families into their reserved space,
  // the rest beside what's already placed.
  let minX = Infinity;
  let maxX = -Infinity;
  const spaceNodes = new Map<Unit, HierarchyPointNode<Unit>>();
  const placeTree = (ti: number) => {
    const { laid, local, lx, rx } = ti ? pre[ti]! : layoutOne(roots[0]);
    if (!ti) laid.each((n) => n.data.space && spaceNodes.set(n.data, n));

    let dx = 0;
    let dy = 0;
    const slot = insertedAt.get(ti) && spaceNodes.get(insertedAt.get(ti)!);
    if (slot) {
      dx = slot.x - (lx + rx) / 2;
      dy = slot.y - ROW_H; // their parents sit one row above the person who married in
    } else if (ti > 0) {
      // Line up generations with the first link into what's already placed.
      const ids = new Set(local.map((c) => c.id));
      let anchor: { theirs: CardPos; ourY: number; rows: number } | undefined;
      for (const c of local) {
        for (const kid of g.childrenOf(c.id)) if (!ids.has(kid) && at.has(kid)) anchor ??= { theirs: at.get(kid)!, ourY: c.y, rows: -1 };
        for (const par of g.parentsOf(c.id)) if (!ids.has(par) && at.has(par)) anchor ??= { theirs: at.get(par)!, ourY: c.y, rows: 1 };
        for (const p of [...g.partnersOf(c.id), ...g.friendsOf(c.id)]) {
          if (!ids.has(p) && at.has(p)) anchor ??= { theirs: at.get(p)!, ourY: c.y, rows: 0 };
        }
      }
      const goLeft = anchor ? anchor.theirs.x + CARD_W / 2 < (minX + maxX) / 2 : false;
      dx = goLeft ? minX - TREE_GAP - rx : maxX + TREE_GAP - lx;
      if (anchor) dy = anchor.theirs.y + anchor.rows * ROW_H - anchor.ourY;
    }

    for (const c of local) {
      const card: CardPos = {
        id: c.id,
        x: c.x + dx,
        y: c.y + dy,
        asPartner: c.id !== c.unit.person && !c.unit.friends.has(c.id),
        asFriend: c.unit.friends.has(c.id),
      };
      cards.push(card);
      at.set(c.id, card);
      minX = Math.min(minX, card.x);
      maxX = Math.max(maxX, card.x + CARD_W);
    }

    // Connectors inside this tree.
    laid.each((node) => {
      const u = node.data;
      if (u.space) return;
      u.order.forEach((id, i) => {
        if (!i) return;
        const prev = u.order[i - 1];
        const a = at.get(prev)!;
        raw.push({
          key: `couple-${prev}-${id}`,
          pts: [a.x + CARD_W, a.y + CARD_H / 2, a.x + CARD_W + PARTNER_GAP, a.y + CARD_H / 2],
          kind: 'line',
          childId: id,
          parentIds: [prev],
          couple: true,
          friend: g.friendsOf(prev).includes(id),
        });
        drawn.add(`${prev}~${id}`).add(`${id}~${prev}`);
      });
      for (const child of node.children ?? []) {
        if (child.data.space) continue;
        const kid = child.data.person;
        const shown = g.parentsOf(kid).filter((p) => u.order.includes(p));
        if (!shown.length) continue;
        const ps = shown.map((p) => at.get(p)!);
        const two = ps.length > 1;
        const x1 = ps.reduce((s, p) => s + p.x + CARD_W / 2, 0) / ps.length;
        const y1 = two ? ps[0].y + CARD_H / 2 : ps[0].y + CARD_H;
        const to = at.get(kid)!;
        raw.push({ key: `p-${shown.join('+')}-${kid}`, pts: [x1, y1, to.x + CARD_W / 2, to.y], kind: 'elbow', childId: kid, parentIds: shown });
        shown.forEach((p) => drawn.add(`${p}>${kid}`));
      }
    });
  };
  // Main tree first, then the families tucked into it, then the rest beside it.
  placeTree(0);
  for (const ti of insertedAt.keys()) placeTree(ti);
  roots.forEach((_, ti) => ti && !insertedAt.has(ti) && placeTree(ti));

  // Connectors between trees: parent -> child, and partners/friends drawn apart.
  for (const c of cards) {
    const missing = g.parentsOf(c.id).filter((p) => at.has(p) && !drawn.has(`${p}>${c.id}`));
    if (missing.length) {
      const ps = missing.map((p) => at.get(p)!);
      const x1 = ps.reduce((s, p) => s + p.x + CARD_W / 2, 0) / ps.length;
      const y1 = Math.max(...ps.map((p) => p.y)) + CARD_H;
      raw.push({ key: `xp-${missing.join('+')}-${c.id}`, pts: [x1, y1, c.x + CARD_W / 2, c.y], kind: 'curve', childId: c.id, parentIds: missing, cross: true });
      missing.forEach((p) => drawn.add(`${p}>${c.id}`));
    }
    for (const p of [...g.partnersOf(c.id), ...g.friendsOf(c.id)]) {
      if (!at.has(p) || drawn.has(`${c.id}~${p}`)) continue;
      const o = at.get(p)!;
      raw.push({
        key: `xc-${c.id}-${p}`,
        pts: [c.x + CARD_W / 2, c.y + CARD_H, o.x + CARD_W / 2, o.y + CARD_H],
        kind: 'curve',
        childId: p,
        parentIds: [c.id],
        couple: true,
        friend: g.friendsOf(c.id).includes(p),
        cross: true,
      });
      drawn.add(`${c.id}~${p}`).add(`${p}~${c.id}`);
    }
  }

  // Normalize to positive coordinates.
  const x0 = Math.min(...cards.map((c) => c.x)) - PAD;
  const y0 = Math.min(...cards.map((c) => c.y)) - PAD;
  const x1 = Math.max(...cards.map((c) => c.x + CARD_W)) + PAD;
  const y1 = Math.max(...cards.map((c) => c.y + CARD_H)) + PAD;
  for (const c of cards) {
    c.x -= x0;
    c.y -= y0;
  }
  const links: LinkPos[] = raw.map(({ pts: [ax, ay, bx, by], kind, ...rest }) => {
    const [a, b, c, d] = [ax - x0, ay - y0, bx - x0, by - y0];
    return {
      ...rest,
      d:
        kind === 'line'
          ? `M${a},${b} H${c}`
          : kind === 'elbow'
            ? elbow(a, b, c, d)
            : curve(a, b, c, d, Math.abs(b - d) < 1 ? 70 : Math.max(60, Math.abs(d - b) / 2)),
    };
  });

  return { cards, links, width: x1 - x0, height: y1 - y0 };
}
