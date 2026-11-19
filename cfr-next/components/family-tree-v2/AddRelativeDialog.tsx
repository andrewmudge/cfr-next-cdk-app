'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FamilyGraph } from '@/lib/family-tree/graph';
import type { PublicPerson, RegisteredPerson } from '@/lib/reunion-config';
import PersonCombobox, { type SelectedPerson } from '@/components/register/PersonCombobox';
import EditPersonForm, { type PersonDetailsInput } from './EditPersonForm';
import { treeApi } from './treeApi';

export type Relation = 'child' | 'parent' | 'partner' | 'friend' | 'sibling';

const TITLES: Record<Relation, string> = {
  child: 'Add a child',
  parent: 'Add a parent',
  partner: 'Add a partner',
  friend: 'Add a friend',
  sibling: 'Add a brother or sister',
};

interface Props {
  g: FamilyGraph;
  of: string;
  relation: Relation;
  /** Everyone who can be picked: tree people plus names from sign-ups. */
  people: PublicPerson[];
  onDone: (newId: string) => void;
  onClose: () => void;
}

const none = new Map<string, RegisteredPerson>();

export default function AddRelativeDialog({ g, of, relation, people, onDone, onClose }: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [picked, setPicked] = useState<SelectedPerson | null>(null);
  const [saving, setSaving] = useState(false);

  // For a child: which partner is the other parent (defaults to the current/co-parent partner).
  const partners = g.partnersOf(of);
  const defaultOther = partners.find((p) => g.isCurrentPartner(of, p)) ?? partners[0];
  const [otherParent, setOtherParent] = useState<string | ''>(relation === 'child' ? defaultOther ?? '' : '');

  const exclude = useMemo(() => {
    const s = new Set<string>([of, ...g.parentsOf(of), ...g.childrenOf(of), ...g.partnersOf(of), ...g.friendsOf(of)]);
    return s;
  }, [g, of]);
  const choices = useMemo(() => people.filter((p) => !exclude.has(p.id)), [people, exclude]);

  const submit = async (body: { existingId?: string; newPerson?: PersonDetailsInput }) => {
    setSaving(true);
    try {
      const res = await treeApi<{ id: string }>('POST', '/api/admin/family-tree/people', {
        relation,
        of,
        ...body,
        ...(relation === 'child' && otherParent ? { otherParentId: otherParent } : {}),
      });
      toast.success('Added to the family tree');
      onDone(res.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={TITLES[relation]}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">
            {TITLES[relation]} <span className="font-normal text-slate-500">for {g.name(of)}</span>
          </h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {relation === 'child' && partners.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="text-sm font-medium text-slate-700">Other parent</p>
            <div className="flex flex-wrap gap-2">
              {[...partners, ''].map((p) => (
                <button
                  key={p || 'none'}
                  type="button"
                  onClick={() => setOtherParent(p)}
                  className={cn(
                    'rounded-full border-2 px-3 min-h-[40px] text-sm',
                    otherParent === p ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 text-slate-600'
                  )}
                >
                  {p ? g.name(p) : 'Not listed'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex rounded-full bg-slate-100 p-1">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn('flex-1 rounded-full min-h-[36px] text-sm font-medium', mode === m ? 'bg-white text-slate-800 shadow' : 'text-slate-500')}
            >
              {m === 'new' ? 'New person' : 'Already on the site'}
            </button>
          ))}
        </div>

        {mode === 'new' ? (
          <EditPersonForm
            initial={relation === 'child' || relation === 'sibling' ? { family: g.get(of)?.family } : {}}
            submitLabel={TITLES[relation]}
            onSubmit={(d) => submit({ newPerson: d })}
            onCancel={onClose}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Pick someone already in the tree or who signed up for the reunion.</p>
            <PersonCombobox people={choices} registered={none} value={picked} onChange={setPicked} allowNew={false} ariaLabel="Person" autoFocus />
            <button
              type="button"
              disabled={!picked || picked.kind !== 'existing' || saving}
              onClick={() => picked?.kind === 'existing' && submit({ existingId: picked.personId })}
              className="w-full rounded-full bg-slate-800 min-h-[44px] text-sm font-semibold text-white disabled:opacity-50"
            >
              {TITLES[relation]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
