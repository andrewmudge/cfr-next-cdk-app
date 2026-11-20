'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, EyeOff, ExternalLink, FileText, Loader2, Newspaper, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

// ---------- Types (mirror lib/chronicle/*) ----------

interface IssueInfo {
  id: string;
  label: string;
  dateLabel: string;
  cutoffLabel: string;
}
interface Photo {
  key: string;
  width: number;
  height: number;
  url: string;
}
type EntryStatus = 'submitted' | 'approved' | 'hidden';
interface Entry {
  issueId: string;
  sk: string;
  personId?: string;
  displayName: string;
  content: string;
  photos: Photo[];
  status: EntryStatus;
  createdAt: string;
}
interface Meta {
  status: 'collecting' | 'final' | 'sent';
  intro?: string;
  finalizedAt?: string;
  sentAt?: string;
  pdfBytes?: number;
}
interface Data {
  issue: IssueInfo;
  currentIssueId: string;
  issues: IssueInfo[];
  meta: Meta;
  pdfUrl: string | null;
  entries: Entry[];
  emailConfigured: boolean;
}

const inputCls = 'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500';
const outlineBtn = 'border-slate-500 text-slate-200 hover:bg-slate-700 bg-transparent';

const STATUS_STYLE: Record<EntryStatus, string> = {
  submitted: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  approved: 'bg-green-500/20 text-green-300 border-green-500/40',
  hidden: 'bg-slate-600/40 text-slate-400 border-slate-500/40',
};
const STATUS_LABEL: Record<EntryStatus, string> = { submitted: 'New', approved: 'In the issue', hidden: 'Hidden' };

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const when = (iso?: string) => {
  try {
    return iso ? format(new Date(iso), 'MMM d, h:mm a') : '';
  } catch {
    return '';
  }
};

export default function Chronicle() {
  const [issueId, setIssueId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  /** Public submissions on/off (null while loading). Stored in lib/site-settings.ts. */
  const [open, setOpen] = useState<boolean | null>(null);
  const [savingOpen, setSavingOpen] = useState(false);

  useEffect(() => {
    fetch('/api/site-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setOpen(d.chronicleOpen !== false))
      .catch(() => setOpen(null));
  }, []);

  const toggleOpen = async (next: boolean) => {
    const msg = next
      ? 'Turn Chronicle submissions on? The form and the home-page link will be visible again.'
      : 'Turn Chronicle submissions off? The home-page link will be hidden, /chronicle will say it is closed, and new updates will be refused.';
    if (!window.confirm(msg)) return;
    setSavingOpen(true);
    try {
      const d = await api('/api/admin/site-settings', 'PUT', { chronicleOpen: next });
      setOpen(d.chronicleOpen);
      toast.success(d.chronicleOpen ? 'Chronicle submissions are on.' : 'Chronicle submissions are off.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingOpen(false);
    }
  };

  const load = useCallback(async (id: string | null) => {
    setLoading(true);
    try {
      const d: Data = await api(`/api/admin/chronicle${id ? `?issue=${id}` : ''}`, 'GET');
      setData(d);
      setIssueId(d.issue.id);
      setIntro(d.meta.intro ?? '');
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const setEntry = (sk: string, patch: Partial<Entry>) =>
    setData((d) => (d ? { ...d, entries: d.entries.map((e) => (e.sk === sk ? { ...e, ...patch } : e)) } : d));

  const patchEntry = (e: Entry, patch: Record<string, unknown>, msg?: string) =>
    run(`entry:${e.sk}`, async () => {
      const { entry } = await api('/api/admin/chronicle/entries', 'PATCH', { issueId: e.issueId, sk: e.sk, ...patch });
      // Keep the signed photo URLs we already have.
      setEntry(e.sk, { ...entry, photos: e.photos.filter((p) => entry.photos.some((q: Photo) => q.key === p.key)) });
      if (msg) toast.success(msg);
    });

  const move = (index: number, dir: -1 | 1) =>
    run('order', async () => {
      if (!data) return;
      const list = [...data.entries];
      const j = index + dir;
      if (j < 0 || j >= list.length) return;
      [list[index], list[j]] = [list[j], list[index]];
      setData({ ...data, entries: list });
      await api('/api/admin/chronicle/entries', 'PUT', { issueId, order: list.map((e) => e.sk) });
    });

  if (loading && !data) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 text-slate-300 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the Chronicle…
      </div>
    );
  }
  if (!data) return null;

  const { issue, meta, entries } = data;
  const counts = {
    submitted: entries.filter((e) => e.status === 'submitted').length,
    approved: entries.filter((e) => e.status === 'approved').length,
    hidden: entries.filter((e) => e.status === 'hidden').length,
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-bold text-white">The Churchwell Chronicle</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <Switch
              checked={!!open}
              disabled={open === null || savingOpen}
              onCheckedChange={toggleOpen}
              aria-label="Chronicle submissions on or off"
              className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-600"
            />
            {open === null ? 'Submissions…' : open ? 'Submissions on' : 'Submissions off'}
            {savingOpen && <Loader2 className="w-4 h-4 animate-spin" />}
          </label>
          <select
            value={issueId ?? ''}
            onChange={(e) => load(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
          >
            {data.issues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
                {i.id === data.currentIssueId ? ' (collecting now)' : ''}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" className={outlineBtn} onClick={() => load(issueId)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="text-sm text-slate-300 space-y-1">
        <p>
          Goes out <strong className="text-white">{issue.dateLabel}</strong> · updates due {issue.cutoffLabel} · public form at{' '}
          <a href="/chronicle" target="_blank" className="text-red-300 underline">
            /chronicle
          </a>
        </p>
        <p>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}: {counts.submitted} new · {counts.approved} in the issue · {counts.hidden} hidden
          {meta.finalizedAt && <> · PDF published {when(meta.finalizedAt)}</>}
          {meta.sentAt && <> · emailed {when(meta.sentAt)}</>}
        </p>
      </div>

      {/* Editor's note */}
      <div className="space-y-2">
        <label className="block font-medium text-slate-200">Editor&apos;s note (cover page, optional)</label>
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={3} className={inputCls} placeholder="A few words to open the issue…" />
        {intro !== (meta.intro ?? '') && (
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={busy === 'intro'}
            onClick={() =>
              run('intro', async () => {
                const { meta: m } = await api('/api/admin/chronicle', 'PUT', { issueId, intro });
                setData({ ...data, meta: m });
                toast.success('Saved');
              })
            }
          >
            Save note
          </Button>
        )}
      </div>

      {/* Issue actions */}
      <div className="flex flex-wrap gap-2">
        {counts.submitted > 0 && (
          <Button
            className="bg-green-700 hover:bg-green-800 text-white"
            disabled={!!busy}
            onClick={() =>
              run('approveAll', async () => {
                for (const e of entries.filter((x) => x.status === 'submitted')) {
                  await api('/api/admin/chronicle/entries', 'PATCH', { issueId: e.issueId, sk: e.sk, status: 'approved' });
                  setEntry(e.sk, { status: 'approved' });
                }
                toast.success('All new entries added to the issue');
              })
            }
          >
            <Check className="w-4 h-4 mr-2" /> Approve all new ({counts.submitted})
          </Button>
        )}
        <Button asChild variant="outline" className={outlineBtn}>
          <a href={`/api/admin/chronicle/pdf?issue=${issueId}`} target="_blank" rel="noopener noreferrer">
            <FileText className="w-4 h-4 mr-2" /> Preview PDF
          </a>
        </Button>
        <Button
          className="bg-red-600 hover:bg-red-700 text-white"
          disabled={!!busy || counts.approved === 0}
          onClick={() =>
            run('finalize', async () => {
              const r = await api('/api/admin/chronicle/finalize', 'POST', { issueId });
              setData({ ...data, meta: r.meta, pdfUrl: r.pdfUrl });
              toast.success('PDF published');
            })
          }
        >
          {busy === 'finalize' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          {meta.finalizedAt ? 'Re-publish PDF' : 'Publish PDF'}
        </Button>
        {data.pdfUrl && (
          <Button asChild variant="outline" className={outlineBtn}>
            <a href={`/chronicle/${issueId}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> Published PDF
              {meta.pdfBytes ? ` (${(meta.pdfBytes / 1024 / 1024).toFixed(1)}MB)` : ''}
            </a>
          </Button>
        )}
      </div>

      {data.pdfUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-slate-900/50 p-3">
          {!data.emailConfigured ? (
            <p className="text-sm text-slate-400">Email sending isn&apos;t set up yet. Once SES is live, you can send this issue to the master list from here.</p>
          ) : (
            <>
              <Button
                variant="outline"
                className={outlineBtn}
                disabled={!!busy}
                onClick={() =>
                  run('test', async () => {
                    await api('/api/admin/chronicle/send', 'POST', { issueId, test: true });
                    toast.success('Test email sent to you');
                  })
                }
              >
                <Send className="w-4 h-4 mr-2" /> Send test to me
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!!busy || meta.status === 'sent'}
                onClick={() => {
                  if (!window.confirm(`Email the ${issue.label} Chronicle to everyone on the master list?`)) return;
                  run('send', async () => {
                    await api('/api/admin/chronicle/send', 'POST', { issueId });
                    setData({ ...data, meta: { ...meta, status: 'sent', sentAt: new Date().toISOString() } });
                    toast.success('Sending to the master list — progress is in Family Email below');
                  });
                }}
              >
                <Send className="w-4 h-4 mr-2" /> {meta.status === 'sent' ? 'Sent to master list' : 'Send to master list'}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="text-slate-400">No updates yet for {issue.label}.</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((e, i) => (
            <EntryCard
              key={e.sk}
              entry={e}
              first={i === 0}
              last={i === entries.length - 1}
              busy={busy === `entry:${e.sk}`}
              onMove={(dir) => move(i, dir)}
              onPatch={(patch, msg) => patchEntry(e, patch, msg)}
              onDelete={() => {
                if (!window.confirm(`Delete ${e.displayName}'s update and photos for good?`)) return;
                run(`entry:${e.sk}`, async () => {
                  await api('/api/admin/chronicle/entries', 'DELETE', { issueId: e.issueId, sk: e.sk });
                  setData((d) => (d ? { ...d, entries: d.entries.filter((x) => x.sk !== e.sk) } : d));
                });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  first,
  last,
  busy,
  onMove,
  onPatch,
  onDelete,
}: {
  entry: Entry;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onPatch: (patch: Record<string, unknown>, msg?: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(entry.displayName);
  const [content, setContent] = useState(entry.content);
  useEffect(() => {
    setName(entry.displayName);
    setContent(entry.content);
  }, [entry.displayName, entry.content]);
  const dirty = name !== entry.displayName || content !== entry.content;

  return (
    <li className={`rounded-lg border border-slate-700 bg-slate-900/60 p-4 space-y-3 ${entry.status === 'hidden' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[entry.status]}`}>{STATUS_LABEL[entry.status]}</span>
        <span className="text-xs text-slate-500">{when(entry.createdAt)}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className={outlineBtn} disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" className={outlineBtn} disabled={last} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} font-semibold`} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={Math.min(10, Math.max(3, Math.ceil(content.length / 80)))} className={inputCls} />

      {entry.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.photos.map((p) => (
            <div key={p.key} className="relative h-24 w-24 overflow-hidden rounded-md bg-slate-700">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </a>
              <button
                type="button"
                aria-label="Remove photo"
                disabled={busy}
                onClick={() => window.confirm('Remove this photo from the entry?') && onPatch({ removePhotoKey: p.key }, 'Photo removed')}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {dirty && (
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={busy || !name.trim()} onClick={() => onPatch({ displayName: name, content }, 'Saved')}>
            Save edits
          </Button>
        )}
        {entry.status !== 'approved' && (
          <Button size="sm" className="bg-green-700 hover:bg-green-800 text-white" disabled={busy} onClick={() => onPatch({ status: 'approved' })}>
            <Check className="w-4 h-4 mr-1" /> Add to issue
          </Button>
        )}
        {entry.status !== 'hidden' && (
          <Button size="sm" variant="outline" className={outlineBtn} disabled={busy} onClick={() => onPatch({ status: 'hidden' })}>
            <EyeOff className="w-4 h-4 mr-1" /> Hide
          </Button>
        )}
        <Button size="sm" variant="outline" className="border-red-500/60 text-red-300 hover:bg-red-600 hover:text-white bg-transparent ml-auto" disabled={busy} onClick={onDelete}>
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400 self-center" />}
      </div>
    </li>
  );
}
