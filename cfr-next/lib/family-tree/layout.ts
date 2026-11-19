import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy';
import type { FamilyGraph } from './graph';

export const CARD_W = 146;
export const CARD_H = 68;
const PARTNER_GAP = 14;
const SIBLING_GAP = 20;
const COUSIN_GAP = 40;
const ROW_H = 150;
const PAD = 60;

export interface CardPos {
  id: string;
  x: number; // top-left
  y: number;
  /** Has ancestors above what's drawn (tap to go further up). */
  moreAbove?: boolean;
  /** Drawn as someone's partner rather than as a blood child in this view. */
  asPartner?: boolean;
}

export interface LinkPos {
  key: string;
  d: string; // SVG path
  childId: string;
  parentIds: string[];
  /** Partner connector (between two cards in a couple). */
  couple?: boolean;
}

export interface TreeLayout {
  cards: CardPos[];
  links: LinkPos[];
  width: number;
  height: number;
  anchorId: string;
}

interface Unit {
  person: string;
  partners: string[];
  children: Unit[];
}

const unitWidth = (u: Unit) => (1 + u.partners.length) * CARD_W + u.partners.length * PARTNER_GAP;

/** Rounded elbow connector from (x1,y1) down to (x2,y2). */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const ym = y1 + (y2 - y1) / 2;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} V${y2}`;
  const r = Math.min(12, Math.abs(x2 - x1) / 2, (y2 - y1) / 4);
  const dir = x2 > x1 ? 1 : -1;
  return [
    `M${x1},${y1}`,
    `V${ym - r}`,
    `Q${x1},${ym} ${x1 + dir * r},${ym}`,
    `H${x2 - dir * r}`,
    `Q${x2},${ym} ${x2},${ym + r}`,
    `V${y2}`,
  ].join(' ');
}

/**
 * Full-tree layout (every generation shown). Focus-person based: the focus person's parents form the top couple ("anchor"), so the
 * focus, their siblings and everyone below are shown, with one more generation of
 * ancestors above the anchor couple.
 */
export function layoutTree(g: FamilyGraph, focusId: string): TreeLayout {
  // The root couple (Patrick & Ollie) is the top of the default view; their parents are
  // still reachable through the "parents" chip.
  const focusParents = focusId === g.rootId ? [] : g.parentsOf(focusId);
  const anchor = focusParents[0] ?? focusId;
  const anchorOther = focusParents[1];

  const placed = new Set<string>();
  const build = (person: string, preferPartner?: string): Unit => {
    placed.add(person);
    let partners = g.partnersOf(person).filter((p) => !placed.has(p));
    if (preferPartner && !partners.includes(preferPartner) && !placed.has(preferPartner)) partners.unshift(preferPartner);
    if (preferPartner) partners = [preferPartner, ...partners.filter((p) => p !== preferPartner)];
    partners.forEach((p) => placed.add(p));
    const kids = g.childrenOf(person).filter((k) => !placed.has(k));
    return {
      person,
      partners,
      children: kids.map((k) => build(k)),
    };
  };
  const rootUnit = build(anchor, anchorOther);

  const root = hierarchy(rootUnit, (u) => u.children);
  const laid = tree<Unit>()
    .nodeSize([1, ROW_H])
    .separation((a, b) => (unitWidth(a.data) + unitWidth(b.data)) / 2 + (a.parent === b.parent ? SIBLING_GAP : COUSIN_GAP))(root);

  const cards: CardPos[] = [];
  // Raw link geometry; turned into SVG paths after coordinates are normalized.
  type Raw = Omit<LinkPos, 'd'> & { pts: [number, number, number, number] };
  const raw: Raw[] = [];
  const cardCenter = new Map<string, { cx: number; top: number }>();

  const unitTop = 0; // anchor row; ancestors go to negative y
  laid.each((node: HierarchyPointNode<Unit>) => {
    const u = node.data;
    const w = unitWidth(u);
    const left = node.x - w / 2;
    const y = unitTop + node.y;
    [u.person, ...u.partners].forEach((id, i) => {
      const x = left + i * (CARD_W + PARTNER_GAP);
      cards.push({
        id,
        x,
        y,
        asPartner: i > 0,
      });
      cardCenter.set(id, { cx: x + CARD_W / 2, top: y });
      if (i > 0) {
        raw.push({
          key: `couple-${u.person}-${id}`,
          pts: [x - PARTNER_GAP, y + CARD_H / 2, x, y + CARD_H / 2],
          childId: id,
          parentIds: [u.person],
          couple: true,
        });
      }
    });
  });

  // Parent → child connectors, starting between the child's two parents when both are shown.
  laid.each((node) => {
    const u = node.data;
    for (const child of node.children ?? []) {
      const kid = child.data.person;
      const other = g.parentsOf(kid).find((p) => p !== u.person);
      const from = cardCenter.get(u.person)!;
      const otherPos = other && u.partners.includes(other) ? cardCenter.get(other) : undefined;
      const x1 = otherPos ? (from.cx + otherPos.cx) / 2 : from.cx;
      const y1 = otherPos ? from.top + CARD_H / 2 : from.top + CARD_H;
      const to = cardCenter.get(kid)!;
      raw.push({
        key: `p-${u.person}-${kid}`,
        pts: [x1, y1, to.cx, to.top],
        childId: kid,
        parentIds: [u.person, ...(other ? [other] : [])],
      });
    }
  });

  // One generation of ancestors above each member of the anchor couple.
  const anchorMembers = [rootUnit.person, ...rootUnit.partners];
  if (focusId === g.rootId) {
    // Default view starts at the root couple: offer a "parents" button instead of drawing them.
    for (const c of cards) if (anchorMembers.includes(c.id) && g.parentsOf(c.id).length) c.moreAbove = true;
  }
  const groups = (focusId === g.rootId ? [] : anchorMembers)
    .map((m) => ({ child: m, parents: g.parentsOf(m).filter((p) => !cardCenter.has(p)) }))
    .filter((x) => x.parents.length)
    .map((x) => {
      const w = x.parents.length * CARD_W + (x.parents.length - 1) * PARTNER_GAP;
      return { ...x, w, want: cardCenter.get(x.child)!.cx - w / 2 };
    })
    .sort((a, b) => a.want - b.want);
  let right = -Infinity;
  const yUp = unitTop - ROW_H;
  for (const grp of groups) {
    const left = Math.max(grp.want, right + COUSIN_GAP);
    right = left + grp.w;
    grp.parents.forEach((p, i) => {
      const x = left + i * (CARD_W + PARTNER_GAP);
      cards.push({ id: p, x, y: yUp, moreAbove: g.parentsOf(p).length > 0 });
      cardCenter.set(p, { cx: x + CARD_W / 2, top: yUp });
      if (i > 0) {
        raw.push({ key: `couple-up-${grp.parents[0]}-${p}`, pts: [x - PARTNER_GAP, yUp + CARD_H / 2, x, yUp + CARD_H / 2], childId: p, parentIds: [grp.parents[0]], couple: true });
      }
    });
    const first = cardCenter.get(grp.parents[0])!;
    const last = cardCenter.get(grp.parents[grp.parents.length - 1])!;
    const two = grp.parents.length > 1;
    const to = cardCenter.get(grp.child)!;
    raw.push({
      key: `up-${grp.child}`,
      pts: [(first.cx + last.cx) / 2, two ? yUp + CARD_H / 2 : yUp + CARD_H, to.cx, to.top],
      childId: grp.child,
      parentIds: grp.parents,
    });
  }

  // Normalize to positive coordinates.
  const minX = Math.min(...cards.map((c) => c.x)) - PAD;
  const minY = Math.min(...cards.map((c) => c.y)) - PAD;
  const maxX = Math.max(...cards.map((c) => c.x + CARD_W)) + PAD;
  const maxY = Math.max(...cards.map((c) => c.y + CARD_H)) + PAD;
  for (const c of cards) {
    c.x -= minX;
    c.y -= minY;
  }
  const links: LinkPos[] = raw.map(({ pts: [x1, y1, x2, y2], ...rest }) => ({
    ...rest,
    d: rest.couple
      ? `M${x1 - minX},${y1 - minY} H${x2 - minX}`
      : elbow(x1 - minX, y1 - minY, x2 - minX, y2 - minY),
  }));

  return { cards, links, width: maxX - minX, height: maxY - minY, anchorId: anchor };
}
