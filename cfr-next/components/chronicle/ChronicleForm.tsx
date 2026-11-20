'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PersonCombobox, { type SelectedPerson } from '@/components/register/PersonCombobox';
import type { PublicPerson, RegisteredPerson } from '@/lib/reunion-config';
import { MAX_CONTENT_CHARS, MAX_PHOTOS, type IssueInfo } from '@/lib/chronicle/issues';
import { preparePhoto, uploadWithPresignedPost } from '@/lib/chronicle/photo';

type PhotoState = {
  id: string;
  previewUrl?: string;
  status: 'preparing' | 'uploading' | 'done' | 'error';
  progress: number;
  key?: string;
  width?: number;
  height?: number;
  error?: string;
};

type Draft = { submitter: SelectedPerson | null; content: string };
const DRAFT_KEY = 'cfr-chronicle-draft-v1';
const NO_REGISTERED = new Map<string, RegisteredPerson>();

function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && typeof d.content === 'string') return { submitter: d.submitter ?? null, content: d.content };
  } catch {}
  return { submitter: null, content: '' };
}

export default function ChronicleForm({ issue }: { issue: IssueInfo }) {
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [peopleError, setPeopleError] = useState(false);
  const [draft, setDraft] = useState<Draft>({ submitter: null, content: '' });
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [uploadIssueId, setUploadIssueId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; issue: IssueInfo } | null>(null);
  const [website, setWebsite] = useState(''); // honeypot
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(loadDraft());
    fetch('/api/people', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPeople(d.people ?? []))
      .catch(() => setPeopleError(true));
  }, []);

  useEffect(() => {
    if (done) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, done]);

  // Free preview blobs when photos go away.
  const previews = useRef(new Set<string>());
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const patchPhoto = (id: string, patch: Partial<PhotoState>) =>
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addFiles = useCallback(
    async (files: File[]) => {
      setError('');
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) return;
      if (files.length > room) setError(`You can add up to ${MAX_PHOTOS} photos, so we kept the first ${room}.`);
      const picked = files.slice(0, room);
      const items: PhotoState[] = picked.map(() => ({ id: crypto.randomUUID(), status: 'preparing', progress: 0 }));
      setPhotos((ps) => [...ps, ...items]);

      // 1. Shrink each photo on the phone.
      const prepared = await Promise.all(
        picked.map(async (file, i) => {
          try {
            const p = await preparePhoto(file);
            const previewUrl = URL.createObjectURL(p.blob);
            previews.current.add(previewUrl);
            patchPhoto(items[i].id, { previewUrl, width: p.width, height: p.height, status: 'uploading' });
            return p;
          } catch {
            patchPhoto(items[i].id, { status: 'error', error: "Couldn't read this photo" });
            return null;
          }
        })
      );
      const ready = prepared.map((p, i) => ({ p, item: items[i] })).filter((x) => x.p);
      if (!ready.length) return;

      // 2. Get upload slots, then 3. send each straight to S3.
      try {
        const res = await fetch('/api/chronicle/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: ready.length }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        setUploadIssueId(data.issueId);
        await Promise.all(
          ready.map(async ({ p, item }, i) => {
            const slot = data.uploads[i];
            try {
              await uploadWithPresignedPost(slot, p!.blob, (f) => patchPhoto(item.id, { progress: f }));
              patchPhoto(item.id, { status: 'done', progress: 1, key: slot.key });
            } catch {
              patchPhoto(item.id, { status: 'error', error: 'Upload failed — remove and try again' });
            }
          })
        );
      } catch (err) {
        ready.forEach(({ item }) => patchPhoto(item.id, { status: 'error', error: 'Upload failed — remove and try again' }));
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [photos.length]
  );

  const removePhoto = (id: string) => setPhotos((ps) => ps.filter((p) => p.id !== id));

  const busy = photos.some((p) => p.status === 'preparing' || p.status === 'uploading');
  const goodPhotos = photos.filter((p) => p.status === 'done' && p.key);
  const canSubmit = !!draft.submitter && (draft.content.trim().length > 0 || goodPhotos.length > 0) && !busy && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!draft.submitter) return setError('Please pick your name.');
    if (photos.some((p) => p.status === 'error')) return setError('Remove the photos that failed before sending.');
    setSubmitting(true);
    try {
      const s = draft.submitter;
      const res = await fetch('/api/chronicle/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitter: s.kind === 'existing' ? { personId: s.personId } : { newName: { given: s.given, family: s.family } },
          content: draft.content,
          issueId: uploadIssueId ?? undefined,
          photos: goodPhotos.map((p) => ({ key: p.key, width: p.width, height: p.height })),
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setDone({ name: s.displayName.split(' ')[0], issue: data.issue });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setDraft((d) => ({ submitter: d.submitter, content: '' }));
    setPhotos([]);
    setUploadIssueId(null);
    setDone(null);
    setError('');
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-lg text-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-800">Thanks, {done.name}!</h2>
        <p className="text-lg text-slate-600">
          Your update will be in the <strong>{done.issue.label}</strong> Chronicle, coming {done.issue.dateLabel}.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button size="lg" className="min-h-[52px] flex-1 bg-red-600 hover:bg-red-700 text-white text-lg" onClick={startOver}>
            Share another update
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-[52px] flex-1 text-lg">
            <Link href="/">Back to the reunion site</Link>
          </Button>
        </div>
      </div>
    );
  }

  const left = MAX_CONTENT_CHARS - draft.content.length;

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 sm:p-8 shadow-lg space-y-7">
      {/* Honeypot: hidden from people, bots fill it in */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="space-y-2">
        <label className="block text-lg font-semibold text-slate-800">Your name</label>
        <PersonCombobox
          people={people}
          registered={NO_REGISTERED}
          value={draft.submitter}
          onChange={(p) => setDraft((d) => ({ ...d, submitter: p }))}
          ariaLabel="Your name"
          placeholder="Start typing your name…"
        />
        {peopleError && <p className="text-sm text-slate-500">Couldn&apos;t load the family list — just type your full name.</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="chronicle-content" className="block text-lg font-semibold text-slate-800">
          What&apos;s new?
        </label>
        <textarea
          id="chronicle-content"
          value={draft.content}
          maxLength={MAX_CONTENT_CHARS}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          rows={6}
          placeholder="New babies, new jobs, trips, graduations, ghost sightings… anything since the last Chronicle."
          className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        <p className={`text-right text-sm ${left < 100 ? 'text-red-600' : 'text-slate-400'}`}>{left} characters left</p>
      </div>

      <div className="space-y-3">
        <p className="text-lg font-semibold text-slate-800">
          Photos <span className="font-normal text-slate-500 text-base">(up to {MAX_PHOTOS})</span>
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) addFiles(files);
          }}
        />
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                {p.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
                {(p.status === 'preparing' || p.status === 'uploading') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    {p.status === 'uploading' && <span className="mt-1 text-xs">{Math.round(p.progress * 100)}%</span>}
                  </div>
                )}
                {p.status === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-600/80 p-2 text-center text-xs text-white">
                    <AlertCircle className="w-5 h-5 mb-1" />
                    {p.error}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full min-h-[64px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-lg font-medium text-slate-600 hover:border-red-400 hover:text-red-600"
          >
            <ImagePlus className="w-6 h-6" />
            {photos.length ? 'Add more photos' : 'Add photos'}
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700">{error}</p>}

      <Button type="submit" size="lg" disabled={!canSubmit} className="w-full min-h-[56px] bg-red-600 hover:bg-red-700 text-white text-lg">
        {submitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : busy ? (
          'Uploading photos…'
        ) : (
          `Send my update for ${issue.label}`
        )}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Updates are reviewed before the Chronicle goes out. Send yours by {issue.cutoffLabel}.
      </p>
    </form>
  );
}
