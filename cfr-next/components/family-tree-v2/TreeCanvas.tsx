'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { ChevronUp } from 'lucide-react';
import type { FamilyGraph } from '@/lib/family-tree/graph';
import { CARD_H, CARD_W, layoutTree } from '@/lib/family-tree/layout';
import PersonCard from './PersonCard';

export interface TreeCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  centerOn: (id: string, scale?: number) => void;
}

interface Props {
  g: FamilyGraph;
  focusId: string;
  selectedId: string | null;
  highlight: Set<string>;
  coming: Set<string>;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
}

const TreeCanvas = forwardRef<TreeCanvasHandle, Props>(function TreeCanvas(
  { g, focusId, selectedId, highlight, coming, onSelect, onFocus },
  ref
) {
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  const [ready, setReady] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutTree(g, focusId), [g, focusId]);
  const pos = useMemo(() => new Map(layout.cards.map((c) => [c.id, c])), [layout]);

  const centerOn = useCallback(
    (id: string, scale?: number, ms = 450) => {
      const z = zoomRef.current;
      const box = boxRef.current;
      const c = pos.get(id);
      if (!z || !box || !c) return;
      // Phones start a little zoomed out so more of the family fits on screen.
      const s = scale ?? Math.max(z.instance.transformState.scale, box.clientWidth < 640 ? 0.72 : 1);
      const cx = c.x + CARD_W / 2;
      const cy = c.y + CARD_H / 2;
      z.setTransform(box.clientWidth / 2 - cx * s, box.clientHeight / 2.6 - cy * s, s, ms, 'easeOut');
    },
    [pos]
  );

  const fit = useCallback(() => {
    const z = zoomRef.current;
    const box = boxRef.current;
    if (!z || !box) return;
    const s = Math.min(1, box.clientWidth / layout.width, box.clientHeight / layout.height);
    z.setTransform((box.clientWidth - layout.width * s) / 2, (box.clientHeight - layout.height * s) / 2, s, 450, 'easeOut');
  }, [layout]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomRef.current?.zoomIn(0.3),
      zoomOut: () => zoomRef.current?.zoomOut(0.3),
      fit,
      centerOn,
    }),
    [fit, centerOn]
  );

  /** Fit a set of people (e.g. a relationship path) on screen. */
  const fitTo = useCallback(
    (ids: Set<string>) => {
      const z = zoomRef.current;
      const box = boxRef.current;
      const cs = layout.cards.filter((c) => ids.has(c.id));
      if (!z || !box || !cs.length) return;
      const x0 = Math.min(...cs.map((c) => c.x)) - 40;
      const y0 = Math.min(...cs.map((c) => c.y)) - 60;
      const x1 = Math.max(...cs.map((c) => c.x + CARD_W)) + 40;
      const y1 = Math.max(...cs.map((c) => c.y + CARD_H)) + 40;
      const s = Math.min(1, box.clientWidth / (x1 - x0), box.clientHeight / (y1 - y0));
      z.setTransform((box.clientWidth - (x1 + x0) * s) / 2, (box.clientHeight - (y1 + y0) * s) / 2, s, 450, 'easeOut');
    },
    [layout]
  );

  // Re-center when the focus changes; when something is highlighted, fit all of it.
  const lastKey = useRef('');
  useEffect(() => {
    if (!ready) return; // the zoom library resets the view while it initializes
    const key = `${focusId}|${[...highlight].join(',')}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const t = setTimeout(() => (highlight.size > 1 ? fitTo(highlight) : centerOn(focusId)), 30);
    return () => clearTimeout(t);
  }, [ready, focusId, highlight, layout, centerOn, fitTo]);

  const hasHighlight = highlight.size > 0;

  return (
    <div ref={boxRef} className="absolute inset-0 touch-none">
      <TransformWrapper
        ref={zoomRef}
        minScale={0.12}
        maxScale={2}
        initialScale={1}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.08 }}
        panning={{ excluded: ['ft-nopan'] }}
        onInit={() => setTimeout(() => setReady(true), 50)}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: layout.width, height: layout.height }}>
          <div className="relative" style={{ width: layout.width, height: layout.height, textRendering: 'geometricPrecision' }}>
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
              {layout.links.map((l) => {
                const on = hasHighlight && highlight.has(l.childId) && l.parentIds.some((p) => highlight.has(p));
                return (
                  <path
                    key={l.key}
                    d={l.d}
                    fill="none"
                    stroke={on ? '#ef4444' : l.friend ? '#e2e8f0' : l.couple ? '#cbd5e1' : '#94a3b8'}
                    strokeWidth={on ? 3.5 : l.couple ? 2 : 1.75}
                    strokeDasharray={l.friend ? '1 5' : l.couple ? '4 4' : undefined}
                    strokeLinecap="round"
                    opacity={hasHighlight && !on ? 0.35 : 1}
                    style={{ transition: 'stroke 200ms, opacity 200ms' }}
                  />
                );
              })}
            </svg>

            <AnimatePresence initial={false}>
              {layout.cards.map((c) => (
                <motion.div
                  key={c.id}
                  id={`ftcard-${c.id}`}
                  className="absolute left-0 top-0"
                  style={{ width: CARD_W, height: CARD_H }}
                  initial={{ opacity: 0, x: c.x, y: c.y, scale: 0.9 }}
                  animate={{ opacity: 1, x: c.x, y: c.y, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                >
                  {c.moreAbove && (
                    <button
                      type="button"
                      onClick={() => onFocus(c.id === g.rootId ? g.parentsOf(c.id)[0] : c.id)}
                      className="ft-nopan absolute -top-7 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 shadow-sm hover:text-slate-800"
                      aria-label={`Show ${g.name(c.id)}'s parents`}
                    >
                      <ChevronUp className="h-3 w-3" /> parents
                    </button>
                  )}
                  <PersonCard
                    g={g}
                    id={c.id}
                    focused={c.id === focusId}
                    highlighted={highlight.has(c.id) || c.id === selectedId}
                    dimmed={hasHighlight && !highlight.has(c.id)}
                    coming={coming.has(c.id)}
                    friendTag={c.asFriend}
                    onClick={() => onSelect(c.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
});

export default TreeCanvas;
