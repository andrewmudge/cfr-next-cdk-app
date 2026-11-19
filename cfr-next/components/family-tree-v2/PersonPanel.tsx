'use client';

import { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, Crosshair, GitBranch, Pencil, Plus, Star, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FamilyGraph } from '@/lib/family-tree/graph';
import type { PublicPerson } from '@/lib/reunion-config';
import { Avatar, BRANCH_COLORS, lifeYears } from './PersonCard';
import EditPersonForm from './EditPersonForm';
import AddRelativeDialog, { type Relation } from './AddRelativeDialog';
import { treeApi } from './treeApi';

interface Props {
  g: FamilyGraph;
  id: string;
  coming: boolean;
  isAdmin: boolean;
  /** Everyone who can be linked (tree + sign-up names), for the admin "add" dialog. */
  people: PublicPerson[];
  onClose: () => void;
  onPick: (id: string) => void;
  onCenter: (id: string) => void;
  onRelate: (id: string) => void;
  onShowLine: (id: string) => void;
  /** Reload the tree after an edit; optionally select someone. */
  onChanged: (selectId?: string | null) => Promise<void>;
}

type ChipAction = { icon: typeof X; label: string; run: () => void };

function Chips({
  g,
  label,
  ids,
  onPick,
  actions,
}: {
  g: FamilyGraph;
  label: string;
  ids: string[];
  onPick: (id: string) => void;
  actions?: (id: string) => ChipAction[];
}) {
  if (!ids.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <span key={id} className="flex items-center rounded-full border border-slate-200 bg-white">
            <button type="button" onClick={() => onPick(id)} className="flex items-center gap-1.5 py-1 pl-1 pr-3 text-sm text-slate-700 hover:text-slate-950">
              <Avatar g={g} id={id} size={24} />
              {g.name(id)}
            </button>
            {actions?.(id).map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.run}
                title={a.label}
                aria-label={a.label}
                className="mr-0.5 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
              >
                <a.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PersonPanel(props: Props) {
  const { g, id, coming, isAdmin, people, onClose, onPick, onCenter, onRelate, onShowLine, onChanged } = props;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<Relation | null>(null);
  const p = g.get(id);
  if (!p) return null;
  const branch = g.branchOf(id);
  const years = lifeYears(g, id);
  const partners = g.partnersOf(id);
  const friends = g.friendsOf(id);
  const parents = g.parentsOf(id);
  const name = (x: string) => g.name(x);

  /** Run an admin edit with a confirmation, then reload. */
  const run = async (confirmText: string | null, method: 'POST' | 'DELETE', url: string, body: unknown, done: string, select?: string | null) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await treeApi(method, url, body);
      toast.success(done);
      await onChanged(select);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const links = '/api/admin/family-tree/links';

  const parentActions = (pid: string): ChipAction[] => [
    { icon: X, label: `Unlink ${name(pid)} as a parent`, run: () => run(`Remove ${name(pid)} as ${p.given}'s parent?`, 'DELETE', links, { type: 'parent', a: pid, b: id }, 'Link removed', id) },
  ];
  const childActions = (cid: string): ChipAction[] => [
    { icon: X, label: `Unlink ${name(cid)} as a child`, run: () => run(`Remove ${name(cid)} as ${p.given}'s child?`, 'DELETE', links, { type: 'parent', a: id, b: cid }, 'Link removed', id) },
  ];
  const partnerActions = (pid: string): ChipAction[] => [
    ...(!g.isCurrentPartner(id, pid)
      ? [{ icon: Star, label: `Make ${name(pid)} the current partner`, run: () => run(null, 'POST', links, { type: 'partner', a: id, b: pid, current: true }, 'Updated', id) }]
      : []),
    { icon: ArrowLeftRight, label: `Change ${name(pid)} to a friend`, run: () => run(`Show ${name(pid)} as ${p.given}'s friend instead of partner?`, 'POST', links, { type: 'friend', a: id, b: pid }, 'Changed to friend', id) },
    { icon: X, label: `Unlink ${name(pid)} as a partner`, run: () => run(`Remove the partner link between ${p.given} and ${name(pid)}?`, 'DELETE', links, { type: 'partner', a: id, b: pid }, 'Link removed', id) },
  ];
  const friendActions = (fid: string): ChipAction[] => [
    { icon: ArrowLeftRight, label: `Change ${name(fid)} to a partner`, run: () => run(`Show ${name(fid)} as ${p.given}'s partner instead of friend?`, 'POST', links, { type: 'partner', a: id, b: fid }, 'Changed to partner', id) },
    { icon: X, label: `Unlink ${name(fid)} as a friend`, run: () => run(`Remove the friend link between ${p.given} and ${name(fid)}?`, 'DELETE', links, { type: 'friend', a: id, b: fid }, 'Link removed', id) },
  ];

  const addButtons: { rel: Relation; label: string; show: boolean }[] = [
    { rel: 'parent', label: 'Parent', show: parents.length < 2 },
    { rel: 'partner', label: 'Partner', show: true },
    { rel: 'child', label: 'Child', show: true },
    { rel: 'sibling', label: 'Sibling', show: parents.length > 0 },
    { rel: 'friend', label: 'Friend', show: true },
  ];

  return (
    <div
      role="dialog"
      aria-label={g.name(id)}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:absolute sm:inset-auto sm:bottom-3 sm:right-3 sm:top-3 sm:w-[22rem] sm:rounded-2xl"
    >
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
      <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
        <X className="h-5 w-5" />
      </button>

      {editing ? (
        <div className="pr-8">
          <p className="mb-3 font-semibold text-slate-800">Edit details</p>
          <EditPersonForm
            initial={{ given: p.given, family: p.family, nickname: p.nickname, gender: p.gender, deceased: p.deceased, born: p.born, died: p.died }}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (d) => {
              try {
                await treeApi('PATCH', `/api/admin/family-tree/people/${encodeURIComponent(id)}`, d);
                toast.success('Saved');
                setEditing(false);
                await onChanged(id);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 pr-8">
          <Avatar g={g} id={id} size={56} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight text-slate-800">{g.name(id)}</h3>
            {p.nickname && <p className="text-sm italic text-slate-500">“{p.nickname}”</p>}
            {p.deceased && <p className="text-sm text-slate-500">In memory{years ? ` · ${years}` : ''}</p>}
            {g.hint(id) && <p className="text-xs text-slate-400">{g.hint(id)}</p>}
            {isAdmin && (
              <button type="button" onClick={() => setEditing(true)} className="mt-1 flex items-center gap-1 text-sm font-medium text-red-600">
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {g.isRootCouple(id) ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Where it all started</span>
        ) : branch !== undefined ? (
          <span className="rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: BRANCH_COLORS[branch % BRANCH_COLORS.length] }}>
            {g.get(g.branchHeads[branch])?.given}&apos;s line
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Family by marriage</span>
        )}
        {coming && (
          <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Coming in 2027
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onCenter(id)} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-700 hover:bg-slate-50">
          <Crosshair className="h-4 w-4" /> Center here
        </button>
        <button type="button" onClick={() => onRelate(id)} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-700 hover:bg-slate-50">
          <Users className="h-4 w-4" /> How related?
        </button>
        <button type="button" onClick={() => onShowLine(id)} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-xs text-slate-700 hover:bg-slate-50">
          <GitBranch className="h-4 w-4" /> Their line
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <Chips g={g} label="Parents" ids={parents} onPick={onPick} actions={isAdmin ? parentActions : undefined} />
        <Chips g={g} label={partners.length > 1 ? 'Partners' : 'Partner'} ids={partners} onPick={onPick} actions={isAdmin ? partnerActions : undefined} />
        <Chips g={g} label="Children" ids={g.childrenOf(id)} onPick={onPick} actions={isAdmin ? childActions : undefined} />
        <Chips g={g} label="Siblings" ids={g.siblingsOf(id)} onPick={onPick} />
        <Chips g={g} label={friends.length > 1 ? 'Friends' : 'Friend'} ids={friends} onPick={onPick} actions={isAdmin ? friendActions : undefined} />
      </div>

      {isAdmin && !editing && (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Add to {p.given}&apos;s family</p>
          <div className="flex flex-wrap gap-2">
            {addButtons
              .filter((a) => a.show)
              .map((a) => (
                <button
                  key={a.rel}
                  type="button"
                  onClick={() => setAdding(a.rel)}
                  className="flex min-h-[40px] items-center gap-1 rounded-full border-2 border-dashed border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-red-400 hover:text-red-600"
                >
                  <Plus className="h-4 w-4" /> {a.label}
                </button>
              ))}
          </div>
          {id !== g.rootId ? (
            <button
              type="button"
              onClick={() =>
                run(
                  `Remove ${g.name(id)} from the family tree? Their links to others are removed too. (Their name stays available for reunion sign-up.)`,
                  'DELETE',
                  `/api/admin/family-tree/people/${encodeURIComponent(id)}`,
                  undefined,
                  'Removed from the tree',
                  null
                )
              }
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" /> Remove from tree
            </button>
          ) : null}
        </div>
      )}

      {adding && (
        <AddRelativeDialog
          g={g}
          of={id}
          relation={adding}
          people={people}
          onClose={() => setAdding(null)}
          onDone={async (newId) => {
            setAdding(null);
            await onChanged(newId);
          }}
        />
      )}
    </div>
  );
}
