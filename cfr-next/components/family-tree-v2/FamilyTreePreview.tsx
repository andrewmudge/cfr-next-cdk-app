'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Home, Loader2, Maximize2, Minimize2, Minus, Plus, ScanSearch, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FamilyGraph } from '@/lib/family-tree/graph';
import { relate, type Relationship } from '@/lib/family-tree/relationship';
import type { TreeData } from '@/lib/family-tree/types';
import { REUNION_YEAR, type PublicPerson, type RegisteredPerson } from '@/lib/reunion-config';
import PersonCombobox, { type SelectedPerson } from '@/components/register/PersonCombobox';
import { useAuth } from '@/lib/auth/AuthContext';
import { isAdminEmail } from '@/lib/admin-client';
import TreeCanvas, { type TreeCanvasHandle } from './TreeCanvas';
import PersonPanel from './PersonPanel';
import RelationshipFinder from './RelationshipFinder';
import { BRANCH_COLORS, MARRIED_IN_COLOR, ROOT_COLOR } from './PersonCard';

const noRegistered = new Map<string, RegisteredPerson>();

export default function FamilyTreePreview() {
  const [g, setG] = useState<FamilyGraph | null>(null);
  const [error, setError] = useState(false);
  const [comingIds, setComingIds] = useState<Set<string>>(new Set());
  const [signupPeople, setSignupPeople] = useState<PublicPerson[]>([]);
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);

  const [focusId, setFocusId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [showComing, setShowComing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [relOpen, setRelOpen] = useState(false);
  const [relA, setRelA] = useState<SelectedPerson | null>(null);
  const [relB, setRelB] = useState<SelectedPerson | null>(null);

  const canvas = useRef<TreeCanvasHandle>(null);

  const loadTree = useCallback(async () => {
    const r = await fetch('/api/family-tree', { cache: 'no-store' });
    if (!r.ok) throw new Error('tree');
    const graph = new FamilyGraph((await r.json()) as TreeData);
    setG(graph);
    return graph;
  }, []);

  useEffect(() => {
    loadTree()
      .then((graph) => setFocusId(graph.rootId))
      .catch(() => setError(true));
    fetch('/api/people')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        // Sign-ups use the same IDs as the tree.
        setComingIds(new Set((d.registered as RegisteredPerson[]).map((r) => r.personId)));
        setSignupPeople(d.people as PublicPerson[]);
      })
      .catch(() => {});
  }, [loadTree]);

  /** After an admin edit: reload, keep the view, optionally select someone. */
  const onChanged = useCallback(
    async (selectId?: string | null) => {
      const graph = await loadTree();
      setFocusId((f) => (graph.has(f) ? f : graph.rootId));
      if (selectId === null) setSelectedId(null);
      else if (selectId && graph.has(selectId)) setSelectedId(selectId);
      setHighlight(new Set());
    },
    [loadTree]
  );

  // Close fullscreen with Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const people: PublicPerson[] = useMemo(
    () =>
      (g?.people ?? [])
        .map((p) => ({
          id: p.id,
          displayName: g!.name(p.id),
          givenName: p.given,
          familyName: p.family,
          nickname: p.nickname,
          hint: g!.hint(p.id),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [g]
  );

  // Admin "add existing person": everyone in the tree plus names from sign-ups.
  const linkablePeople: PublicPerson[] = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const p of signupPeople) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [people, signupPeople]);

  const coming = showComing ? comingIds : new Set<string>();

  const relation: Relationship | null = useMemo(() => {
    if (!g || relA?.kind !== 'existing' || relB?.kind !== 'existing') return null;
    return relate(g, relA.personId, relB.personId);
  }, [g, relA, relB]);

  const goTo = useCallback(
    (id: string, opts: { select?: boolean; line?: boolean } = {}) => {
      if (!g) return;
      setFocusId(id);
      if (opts.select) setSelectedId(id);
      setHighlight(opts.line ? new Set(g.lineToTop(id)) : new Set());
    },
    [g]
  );

  const showRelation = () => {
    if (!relation || !g) return;
    setFocusId(relation.focusId ?? relation.pathIds[0]);
    setHighlight(new Set(relation.pathIds));
    setSelectedId(null);
  };

  if (error) return null;

  return (
    <section id="family-tree-preview" className="bg-gradient-to-b from-slate-50 to-white py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 text-center">
          <span className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Preview · new design
          </span>
          <h2 className="mb-3 text-4xl font-bold text-slate-800 md:text-5xl">Our Family Tree</h2>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            Tap anyone to see their family. Search for a name, or find out exactly how two people are related.
          </p>
        </div>

        {!g ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex-1">
                <PersonCombobox
                  people={people}
                  registered={noRegistered}
                  value={null}
                  onChange={(p) => p?.kind === 'existing' && goTo(p.personId, { select: true, line: true })}
                  allowNew={false}
                  placeholder="Find someone in the family…"
                  ariaLabel="Find someone in the family"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRelOpen((o) => !o)}
                  className={cn(
                    'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium sm:flex-none sm:gap-2 sm:px-4',
                    relOpen ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  )}
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="sm:hidden">How related?</span>
                    <span className="hidden sm:inline">How are we related?</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={showComing}
                  onClick={() => setShowComing((s) => !s)}
                  className={cn(
                    'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium sm:flex-none sm:gap-2 sm:px-4',
                    showComing ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  )}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="sm:hidden">Who&apos;s coming</span>
                    <span className="hidden sm:inline">Who&apos;s coming in {REUNION_YEAR}</span>
                  </span>
                  {comingIds.size > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs">{comingIds.size}</span>}
                </button>
              </div>
            </div>

            {relOpen && (
              <RelationshipFinder
                people={people}
                a={relA}
                b={relB}
                onChange={(a, b) => {
                  setRelA(a);
                  setRelB(b);
                }}
                result={relation}
                onShow={showRelation}
                onClose={() => setRelOpen(false)}
              />
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
              <button type="button" onClick={() => goTo(g.rootId)} className="flex items-center gap-1.5 hover:text-slate-900">
                <span className="h-3 w-3 rounded-full" style={{ background: ROOT_COLOR }} /> Patrick &amp; Ollie
              </button>
              {g.branchHeads.map((id, i) => (
                <button key={id} type="button" onClick={() => goTo(id, { select: true })} className="flex items-center gap-1.5 hover:text-slate-900">
                  <span className="h-3 w-3 rounded-full" style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                  {g.get(id)?.given}&apos;s line
                </button>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: MARRIED_IN_COLOR }} /> Family by marriage
              </span>
            </div>

            {/* Main view */}
            <div
              className={cn(
                'relative overflow-hidden border border-slate-200 bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:22px_22px]',
                fullscreen ? 'fixed inset-0 z-50 bg-slate-50' : 'rounded-3xl bg-white shadow-lg',
                !fullscreen && 'h-[72vh] min-h-[480px]'
              )}
            >
              <>
                  <TreeCanvas
                    ref={canvas}
                    g={g}
                    focusId={focusId}
                    selectedId={selectedId}
                    highlight={highlight}
                    coming={coming}
                    onSelect={(id) => setSelectedId(id)}
                    onFocus={(id) => goTo(id)}
                  />
                  <div className="absolute bottom-3 left-3 flex flex-row gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-md backdrop-blur sm:flex-col sm:gap-1.5 sm:p-1.5">
                    {[
                      { icon: Plus, label: 'Zoom in', fn: () => canvas.current?.zoomIn() },
                      { icon: Minus, label: 'Zoom out', fn: () => canvas.current?.zoomOut() },
                      { icon: ScanSearch, label: 'Fit everyone on screen', fn: () => canvas.current?.fit() },
                      { icon: Home, label: 'Back to Patrick', fn: () => goTo(g.rootId) },
                    ].map(({ icon: Icon, label, fn }) => (
                      <button key={label} type="button" onClick={fn} title={label} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100">
                        <Icon className="h-5 w-5" />
                      </button>
                    ))}
                  </div>
                  {highlight.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setHighlight(new Set())}
                      className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-sm text-white shadow-lg"
                    >
                      Clear highlight
                    </button>
                  )}
              </>

              <button
                type="button"
                onClick={() => setFullscreen((f) => !f)}
                className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-md backdrop-blur hover:bg-slate-100"
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                title={fullscreen ? 'Exit full screen' : 'Full screen'}
              >
                {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </button>

              {selectedId && (
                <PersonPanel
                  g={g}
                  id={selectedId}
                  coming={comingIds.has(selectedId)}
                  isAdmin={isAdmin}
                  people={linkablePeople}
                  onChanged={onChanged}
                  onClose={() => setSelectedId(null)}
                  onPick={(id) => goTo(id, { select: true })}
                  onCenter={(id) => {
                    goTo(id, { select: true });
                  }}
                  onRelate={(id) => {
                    setRelA({ kind: 'existing', personId: id, displayName: g.name(id) });
                    setRelB(null);
                    setRelOpen(true);
                    setSelectedId(null);
                    document.getElementById('family-tree-preview')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  onShowLine={(id) => {
                    goTo(id, { select: false, line: true });
                    setFocusId(g.lineToTop(id).at(-1)!);
                  }}
                />
              )}
            </div>

            <p className="text-center text-sm text-slate-500">
              This is a preview of a new family tree design. The original tree is still in the Family Album above.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
