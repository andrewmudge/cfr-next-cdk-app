'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, FileUp, Loader2, Mail, Paperclip, RefreshCw, Send, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ---------- Types (mirror lib/messaging/*) ----------

type MemberStatus = 'subscribed' | 'archived' | 'unsubscribed' | 'bounced' | 'complained';
interface Member {
  email: string;
  name?: string;
  sources: string[];
  status: MemberStatus;
  statusReason?: string;
  addedAt: string;
}
interface Attachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}
interface Broadcast {
  broadcastId: string;
  kind: 'email' | 'signup';
  status: 'queued' | 'sending' | 'sent' | 'partial' | 'failed' | 'skipped';
  createdAt: string;
  subject?: string;
  audience?: { type: string; emails?: string[] };
  attachments?: Attachment[];
  submissionId?: string;
  submitterName?: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  failures?: { email: string; error: string }[];
}

// Keep in sync with ATTACHMENT_TYPES / limits in lib/messaging/broadcast.ts.
const ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/heic': ['.heic'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
const MAX_TOTAL = 25 * 1024 * 1024;
const MAX_FILES = 10;

const inputCls = 'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500';
const outlineBtn = 'border-slate-500 text-slate-200 hover:bg-slate-700 bg-transparent';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;
const fmt = (iso: string) => {
  try {
    return format(new Date(iso), 'MMM d, h:mm a');
  } catch {
    return iso;
  }
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

// ---------- Panel ----------

export default function Messaging() {
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [tab, setTab] = useState('compose');
  const [historyKey, setHistoryKey] = useState(0);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const data = await api<{ members: Member[] }>('/api/admin/mailing-list');
      setMembers(data.members);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const subscribed = members.filter((m) => m.status === 'subscribed');

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Mail className="w-6 h-6 text-sky-400" /> Family Email
        {!membersLoading && (
          <span className="text-gray-400 font-normal text-base">({subscribed.length} on the list)</span>
        )}
      </h2>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-900 text-slate-400 flex-wrap h-auto">
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="list">Mailing list</TabsTrigger>
          <TabsTrigger value="history">Sent</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="pt-4">
          <Compose
            subscribed={subscribed}
            onSent={() => {
              setHistoryKey((k) => k + 1);
              setTab('history');
            }}
          />
        </TabsContent>
        <TabsContent value="list" className="pt-4">
          <MailingList members={members} loading={membersLoading} reload={loadMembers} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <History key={historyKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Compose ----------

type Upload = { file: File; status: 'uploading' | 'done' | 'error'; attachment?: Attachment; error?: string };

function Compose({ subscribed, onSent }: { subscribed: Member[]; onSent: () => void }) {
  const [audience, setAudience] = useState<'everyone' | 'thisYear' | 'list'>('everyone');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickQuery, setPickQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [sending, setSending] = useState<'' | 'test' | 'real'>('');

  const totalSize = uploads.reduce((n, u) => n + u.file.size, 0);
  const uploading = uploads.some((u) => u.status === 'uploading');

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (uploads.length + files.length > MAX_FILES) return toast.error(`Attach at most ${MAX_FILES} files.`);
      if (totalSize + files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return toast.error('Attachments are limited to 25 MB total.');
      const fresh: Upload[] = files.map((file) => ({ file, status: 'uploading' }));
      setUploads((u) => [...u, ...fresh]);
      const update = (file: File, patch: Partial<Upload>) =>
        setUploads((list) => list.map((u) => (u.file === file ? { ...u, ...patch } : u)));
      try {
        const { uploads: urls } = await api<{ uploads: { attachment: Attachment; uploadUrl: string }[] }>(
          '/api/admin/messages/attachments',
          { method: 'POST', body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })) }) }
        );
        await Promise.all(
          files.map(async (file, i) => {
            const { attachment, uploadUrl } = urls[i];
            try {
              const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
              if (!res.ok) throw new Error(`Upload failed (${res.status})`);
              update(file, { status: 'done', attachment });
            } catch (err) {
              update(file, { status: 'error', error: (err as Error).message });
            }
          })
        );
      } catch (err) {
        files.forEach((f) => update(f, { status: 'error', error: (err as Error).message }));
      }
    },
    [uploads.length, totalSize]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    onDropRejected: () => toast.error('Only PDF, image and Word files can be attached.'),
  });

  const pickList = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    return subscribed.filter((m) => !q || m.email.includes(q) || (m.name || '').toLowerCase().includes(q)).slice(0, 200);
  }, [subscribed, pickQuery]);

  const recipientLabel =
    audience === 'everyone'
      ? `everyone on the mailing list (${subscribed.length})`
      : audience === 'thisYear'
        ? "every family signed up for this year's reunion"
        : `${picked.size} ${picked.size === 1 ? 'person' : 'people'}`;

  const send = async (test: boolean) => {
    if (!subject.trim() || !body.trim()) return toast.error('Add a subject and a message.');
    if (uploading) return toast.error('Wait for attachments to finish uploading.');
    if (uploads.some((u) => u.status === 'error')) return toast.error('Remove the attachments that failed to upload.');
    if (!test && audience === 'list' && !picked.size) return toast.error('Pick at least one person.');
    if (!test && !window.confirm(`Send "${subject.trim()}" to ${recipientLabel}?`)) return;
    setSending(test ? 'test' : 'real');
    try {
      await api('/api/admin/messages', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          audience,
          emails: audience === 'list' ? [...picked] : [],
          test,
          attachments: uploads.filter((u) => u.attachment).map((u) => u.attachment),
        }),
      });
      if (test) {
        toast.success('Test sent to your email. It can take a minute to arrive.');
      } else {
        toast.success('Sending! Watch progress on the Sent tab.');
        setSubject('');
        setBody('');
        setUploads([]);
        setPicked(new Set());
        onSent();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending('');
    }
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-300 mb-1">Send to</legend>
        {(
          [
            ['everyone', `Everyone on the mailing list (${subscribed.length})`],
            ['thisYear', "Families signed up for this year's reunion"],
            ['list', 'Pick people'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-gray-200">
            <input type="radio" name="audience" checked={audience === value} onChange={() => setAudience(value)} />
            {label}
          </label>
        ))}
      </fieldset>

      {audience === 'list' && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Search names or emails" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
            {picked.size > 0 && (
              <Button size="sm" variant="outline" className={outlineBtn} onClick={() => setPicked(new Set())}>
                Clear ({picked.size})
              </Button>
            )}
          </div>
          <ul className="max-h-56 overflow-y-auto divide-y divide-slate-800">
            {pickList.map((m) => (
              <li key={m.email}>
                <label className="flex items-center gap-2 py-1.5 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={picked.has(m.email)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(m.email);
                        else next.delete(m.email);
                        return next;
                      })
                    }
                  />
                  {m.name ? (
                    <span>
                      {m.name} <span className="text-gray-500">{m.email}</span>
                    </span>
                  ) : (
                    m.email
                  )}
                </label>
              </li>
            ))}
            {!pickList.length && <li className="py-2 text-sm text-gray-500">No matches.</li>}
          </ul>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-gray-300" htmlFor="msg-subject">
          Subject
        </label>
        <input id="msg-subject" className={inputCls} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-300" htmlFor="msg-body">
          Message
        </label>
        <textarea
          id="msg-body"
          className={`${inputCls} min-h-[200px] font-sans`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Hi family,\n\nLeave a blank line between paragraphs. **Double asterisks** make text bold, and links like https://churchwellreunion.com become clickable.'}
        />
      </div>

      <div className="space-y-2">
        <div
          {...getRootProps()}
          className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer text-sm ${
            isDragActive ? 'border-sky-400 bg-sky-500/10 text-sky-200' : 'border-slate-600 text-gray-400 hover:border-slate-500'
          }`}
        >
          <input {...getInputProps()} />
          <Paperclip className="w-5 h-5 mx-auto mb-1" />
          Drop attachments here or click to choose. PDF, photos and Word files, 25 MB total.
        </div>
        {uploads.length > 0 && (
          <ul className="space-y-1">
            {uploads.map((u, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-slate-900 px-3 py-1.5 text-sm text-gray-200">
                <span className="truncate">
                  {u.file.name} <span className="text-gray-500">· {mb(u.file.size)}</span>
                  {u.status === 'uploading' && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
                  {u.status === 'error' && <span className="ml-2 text-red-300">{u.error}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${u.file.name}`}
                  className="text-gray-400 hover:text-white"
                  onClick={() => setUploads((list) => list.filter((x) => x !== u))}
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
            <li className="text-xs text-gray-500">{mb(totalSize)} of 25 MB</li>
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className={outlineBtn} disabled={!!sending} onClick={() => send(true)}>
          {sending === 'test' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
          Send test to me
        </Button>
        <Button className="bg-sky-600 hover:bg-sky-700 text-white" disabled={!!sending} onClick={() => send(false)}>
          {sending === 'real' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Send to {audience === 'list' ? `${picked.size} picked` : audience === 'everyone' ? `everyone (${subscribed.length})` : "this year's families"}
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Each person gets their own copy with an unsubscribe link. Replies come to the organizers&apos; Gmail.
      </p>
    </div>
  );
}

// ---------- Mailing list ----------

const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Read an uploaded list as CSV text for /api/admin/mailing-list/import.
 * Excel files are converted in the browser (first sheet only), so the server
 * only ever parses one format.
 */
async function fileToCsv(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. In Excel, use File → Save As → .xlsx (or CSV).');
  if (!name.endsWith('.xlsx')) return file.text();
  const { readSheet } = await import('read-excel-file/browser');
  const rows = await readSheet(file);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

const STATUS_STYLE: Record<MemberStatus, string> = {
  subscribed: 'text-green-300',
  archived: 'text-slate-300',
  unsubscribed: 'text-gray-400',
  bounced: 'text-red-300',
  complained: 'text-amber-300',
};
const STATUS_LABEL: Record<MemberStatus, string> = {
  subscribed: 'active',
  archived: 'archived',
  unsubscribed: 'unsubscribed',
  bounced: 'bounced',
  complained: 'marked as spam',
};
// Statuses shown (and selectable) in the Active view; archived people live in the Archive view.
const ACTIVE_VIEW_STATUSES: MemberStatus[] = ['subscribed', 'unsubscribed', 'bounced', 'complained'];

type ImportPreview = {
  csv: string;
  list: 'active' | 'archive';
  found: number;
  new: number;
  alreadyOnList: number;
  alreadyActive: number;
  alreadyArchived: number;
  invalid: string[];
  sample: string[];
};

function MailingList({ members, loading, reload }: { members: Member[]; loading: boolean; reload: () => Promise<void> }) {
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState('');
  const [importInto, setImportInto] = useState<'active' | 'archive'>('active');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    members.forEach((m) => (c[m.status] = (c[m.status] || 0) + 1));
    return c;
  }, [members]);
  const archivedCount = counts.archived || 0;
  const activeViewCount = members.length - archivedCount;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter(
      (m) =>
        (view === 'archive' ? m.status === 'archived' : m.status !== 'archived') &&
        (view === 'archive' || statusFilter === 'all' || m.status === statusFilter) &&
        (!q || m.email.includes(q) || (m.name || '').toLowerCase().includes(q))
    );
  }, [members, query, statusFilter, view]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const add = () =>
    run('add', async () => {
      await api('/api/admin/mailing-list', { method: 'POST', body: JSON.stringify({ email: newEmail, name: newName }) });
      toast.success(`Added ${newEmail} to the active list`);
      setNewEmail('');
      setNewName('');
      await reload();
    });

  const sync = () =>
    run('sync', async () => {
      const { result } = await api<{ result: Record<string, { added: number; updated: number }> }>('/api/admin/mailing-list/sync', {
        method: 'POST',
      });
      const added = Object.values(result).reduce((n, r) => n + r.added, 0);
      toast.success(`Synced from the site: ${added} new ${added === 1 ? 'address' : 'addresses'} added.`);
      await reload();
    });

  const pickFile = (file: File) =>
    run('preview', async () => {
      const csv = await fileToCsv(file);
      const p = await api<Omit<ImportPreview, 'csv' | 'list'>>('/api/admin/mailing-list/import', {
        method: 'POST',
        body: JSON.stringify({ csv, dryRun: true, list: importInto }),
      });
      setPreview({ ...p, csv, list: importInto });
    });

  const confirmImport = () =>
    run('import', async () => {
      if (!preview) return;
      const r = await api<{ added: number; updated: number }>('/api/admin/mailing-list/import', {
        method: 'POST',
        body: JSON.stringify({ csv: preview.csv, list: preview.list }),
      });
      toast.success(`Imported into the ${preview.list} list: ${r.added} added, ${r.updated} updated.`);
      setView(preview.list);
      setPreview(null);
      await reload();
    });

  const setStatus = (m: Member, status: MemberStatus) =>
    run(m.email, async () => {
      await api(`/api/admin/mailing-list/${encodeURIComponent(m.email)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await reload();
    });

  const remove = (m: Member) => {
    if (!window.confirm(`Delete ${m.email} completely? (To keep it on file without emailing, archive it instead.)`)) return;
    run(m.email, async () => {
      await api(`/api/admin/mailing-list/${encodeURIComponent(m.email)}`, { method: 'DELETE' });
      await reload();
    });
  };

  const viewBtn = (v: 'active' | 'archive', label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`rounded-md px-3 py-1.5 text-sm ${view === v ? 'bg-slate-600 text-white' : 'text-gray-400 hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className={outlineBtn} onClick={sync} disabled={!!busy}>
          {busy === 'sync' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Sync from site data
        </Button>
        <div className="flex items-center gap-1 rounded-md border border-slate-600 pl-2">
          <label htmlFor="import-into" className="text-xs text-gray-400">
            Import into
          </label>
          <select
            id="import-into"
            value={importInto}
            onChange={(e) => setImportInto(e.target.value as 'active' | 'archive')}
            className="bg-transparent text-sm text-white py-1"
          >
            <option value="active" className="bg-slate-900">
              Active list
            </option>
            <option value="archive" className="bg-slate-900">
              Archive
            </option>
          </select>
          <Button size="sm" variant="outline" className={`${outlineBtn} border-0 border-l rounded-l-none`} onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy === 'preview' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileUp className="w-4 h-4 mr-1" />}
            Choose Excel or CSV
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) pickFile(f);
          }}
        />
      </div>
      <p className="text-xs text-gray-500">
        <strong className="text-gray-400">Active</strong> people get emails. <strong className="text-gray-400">Archive</strong> keeps
        addresses on file (e.g. people who used to come) but never emails them; an archived person who signs up again moves back to
        Active. Import takes an Excel (.xlsx) or CSV file with an Email column, plus optional Name or First Name / Last Name. Imports
        and syncs only add new addresses; people already on the list keep their status. Sync pulls emails from the family tree, every
        year&apos;s sign-ups and site accounts, all into Active.
      </p>

      {preview && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 text-sm text-sky-100 space-y-2">
          <p>
            Found <strong>{preview.found}</strong> addresses: <strong>{preview.new}</strong> new
            {preview.list === 'archive' ? ' (will be archived, not emailed)' : ' (will be active)'}, {preview.alreadyOnList} already on
            the list
            {preview.invalid.length > 0 && `, ${preview.invalid.length} unreadable`}.
          </p>
          {preview.list === 'archive' && preview.alreadyActive > 0 && (
            <p className="text-amber-200">
              {preview.alreadyActive} of these are already on the active list and will stay active. Archive them by hand if they
              shouldn&apos;t get emails.
            </p>
          )}
          {preview.list === 'active' && preview.alreadyArchived > 0 && (
            <p className="text-amber-200">
              {preview.alreadyArchived} of these are in the archive and will stay archived. Restore them by hand to email them.
            </p>
          )}
          {preview.sample.length > 0 && <p className="text-sky-200/80">New, e.g. {preview.sample.join(', ')}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={confirmImport} disabled={!!busy || !preview.new}>
              {busy === 'import' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Add {preview.new} to {preview.list === 'archive' ? 'the archive' : 'the active list'}
            </Button>
            <Button size="sm" variant="outline" className={outlineBtn} onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <input className={`${inputCls} max-w-xs`} placeholder="email@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <input className={`${inputCls} max-w-xs`} placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-10" onClick={add} disabled={!newEmail.trim() || !!busy}>
          <UserPlus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-md border border-slate-600 bg-slate-900 p-0.5" role="group" aria-label="Which list">
          {viewBtn('active', `Active (${activeViewCount})`)}
          {viewBtn('archive', `Archive (${archivedCount})`)}
        </div>
        <input className={`${inputCls} max-w-xs`} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        {view === 'active' && (
          <select
            className="rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All ({activeViewCount})</option>
            {ACTIVE_VIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]} ({counts[s] || 0})
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      ) : !shown.length ? (
        <p className="text-gray-400">
          {view === 'archive'
            ? 'The archive is empty. Import a file into the Archive, or archive people from the Active list.'
            : !members.length
              ? 'The list is empty. Import your list, or start with "Sync from site data".'
              : 'No one matches.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs uppercase text-gray-400 border-b border-slate-700">
              <tr>
                <th className="py-2 pr-4">Name / email</th>
                <th className="py-2 pr-4">From</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 500).map((m) => (
                <tr key={m.email} className="border-b border-slate-700/60">
                  <td className="py-2 pr-4">
                    {m.name && <div className="text-white">{m.name}</div>}
                    <div className="text-gray-400">{m.email}</div>
                  </td>
                  <td className="py-2 pr-4 text-xs text-gray-400">{(m.sources || []).join(', ')}</td>
                  <td className="py-2 pr-4">
                    {view === 'archive' ? (
                      <span className={STATUS_STYLE.archived} title={m.statusReason}>
                        archived
                      </span>
                    ) : (
                      <select
                        value={m.status}
                        disabled={busy === m.email}
                        onChange={(e) => setStatus(m, e.target.value as MemberStatus)}
                        className={`rounded border border-slate-600 bg-slate-900 px-1 py-0.5 ${STATUS_STYLE[m.status]}`}
                        aria-label={`Status for ${m.email}`}
                        title={m.statusReason}
                      >
                        {ACTIVE_VIEW_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-3">
                      {view === 'archive' ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-green-300 hover:text-green-200"
                          onClick={() => setStatus(m, 'subscribed')}
                          disabled={busy === m.email}
                          aria-label={`Restore ${m.email} to the active list`}
                        >
                          <ArchiveRestore className="w-4 h-4" /> Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                          onClick={() => setStatus(m, 'archived')}
                          disabled={busy === m.email}
                          aria-label={`Archive ${m.email}`}
                        >
                          <Archive className="w-4 h-4" /> Archive
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-gray-500 hover:text-red-300"
                        aria-label={`Delete ${m.email}`}
                        onClick={() => remove(m)}
                        disabled={busy === m.email}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 500 && <p className="text-xs text-gray-500 mt-2">Showing 500 of {shown.length}. Search to narrow it down.</p>}
        </div>
      )}
    </div>
  );
}

// ---------- History ----------

const STATUS_BADGE: Record<Broadcast['status'], string> = {
  queued: 'bg-slate-600 text-slate-100',
  sending: 'bg-sky-600 text-white',
  sent: 'bg-green-700 text-green-50',
  partial: 'bg-amber-600 text-white',
  failed: 'bg-red-700 text-white',
  skipped: 'bg-slate-700 text-slate-300',
};

const audienceText = (b: Broadcast) => {
  switch (b.audience?.type) {
    case 'everyone':
      return 'Everyone';
    case 'thisYear':
      return "This year's families";
    case 'list':
      return `${b.audience.emails?.length ?? 0} picked`;
    case 'test':
      return 'Test to me';
    default:
      return '';
  }
};

function History() {
  const [items, setItems] = useState<Broadcast[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ configured: boolean; broadcasts: Broadcast[] }>('/api/admin/messages');
      setItems(data.broadcasts);
      setConfigured(data.configured);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is still going out.
  const active = items.some((b) => b.status === 'queued' || b.status === 'sending');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-slate-400" />;
  return (
    <div className="space-y-3">
      {!configured && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Email sending isn&apos;t set up on this server yet (BROADCAST_FUNCTION_NAME is missing).
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className={outlineBtn} onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>
      {!items.length ? (
        <p className="text-gray-400">Nothing sent yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.broadcastId} className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">
              <button type="button" className="w-full text-left" onClick={() => setOpen(open === b.broadcastId ? null : b.broadcastId)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                  <span className="font-medium text-white">
                    {b.kind === 'signup' ? `Sign-up: ${b.submitterName || 'new family'}` : b.subject}
                  </span>
                  {b.kind === 'email' && <span className="text-gray-400">· {audienceText(b)}</span>}
                  {!!b.attachments?.length && (
                    <span className="text-gray-400">
                      · <Paperclip className="inline w-3 h-3" /> {b.attachments.length}
                    </span>
                  )}
                  <span className="ml-auto text-gray-500">{fmt(b.createdAt)}</span>
                </div>
                {b.recipientCount !== undefined && (
                  <div className="mt-1 text-gray-400">
                    {b.sentCount ?? 0} of {b.recipientCount} sent
                    {!!b.failedCount && <span className="text-red-300"> · {b.failedCount} failed</span>}
                    {b.status === 'sending' && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
                  </div>
                )}
              </button>
              {open === b.broadcastId && !!b.failures?.length && (
                <ul className="mt-2 space-y-1 text-xs text-red-200">
                  {b.failures.map((f, i) => (
                    <li key={i}>
                      {f.email && <strong>{f.email}: </strong>}
                      {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
