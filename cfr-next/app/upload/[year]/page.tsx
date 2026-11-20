'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ImagePlus, Loader2, XCircle } from 'lucide-react';
import { compressImageIfNeeded } from '@/lib/image-compress';
import { clearPhotoCache } from '@/lib/s3-utils';
import { reunionYear } from '@/lib/reunion-config';

// Shareable link straight to photo upload for one gallery year, e.g. /upload/2026.
// Phones only open the photo picker after a tap, so the page is one big button.

type Item = { name: string; status: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string };

export default function UploadPhotosPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = use(params);
  const valid = /^\d{4}$/.test(year) && Number(year) >= 1950 && Number(year) <= reunionYear();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => i.status === 'uploading' || i.status === 'waiting');
  const done = items.filter((i) => i.status === 'done').length;

  const upload = async (files: File[]) => {
    const start = items.length;
    setItems((prev) => [...prev, ...files.map((f) => ({ name: f.name, status: 'waiting' as const }))]);
    const set = (i: number, patch: Partial<Item>) =>
      setItems((prev) => prev.map((it, idx) => (idx === start + i ? { ...it, ...patch } : it)));

    // One at a time, same steps as the gallery's own upload.
    for (const [i, file] of files.entries()) {
      set(i, { status: 'uploading' });
      try {
        const formData = new FormData();
        formData.append('file', await compressImageIfNeeded(file));
        formData.append('year', year);
        formData.append(
          'metadata',
          JSON.stringify({ caption: file.name.replace(/\.[^/.]+$/, ''), uploader: 'You', date: new Date().toISOString().split('T')[0] })
        );
        const res = await fetch('/api/photos/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          throw new Error(result.error || `Upload failed (${res.status})`);
        }
        set(i, { status: 'done' });
      } catch (e) {
        set(i, { status: 'failed', error: e instanceof Error ? e.message : 'Upload failed' });
      }
    }
    clearPhotoCache(year);
  };

  if (!valid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <p className="text-lg text-slate-700">That isn&apos;t a gallery year.</p>
          <Link href="/#family-album" className="mt-3 inline-block text-red-600 underline underline-offset-4">
            Go to the Family Album
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10">
      <div className="mx-auto max-w-md space-y-6 text-center">
        <img src="/favicon.png" alt="" className="mx-auto h-16 w-16 rounded-full border-2 border-red-600 bg-white p-1" />
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Add photos to {year}</h1>
          <p className="mt-2 text-slate-600">Pick photos from your phone and they&apos;ll go straight into the {year} gallery.</p>
        </div>

        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ''; // allow picking the same photos again
            if (files.length) upload(files);
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-red-600 px-6 py-5 text-xl font-semibold text-white shadow-lg hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
          {busy ? 'Uploading…' : items.length ? 'Choose more photos' : 'Choose photos'}
        </button>

        {items.length > 0 && (
          <div className="space-y-3 text-left">
            <p className="text-center text-sm text-slate-500">
              {done} of {items.length} uploaded
            </p>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {it.status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  ) : it.status === 'failed' ? (
                    <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                  ) : (
                    <Loader2 className={`h-5 w-5 shrink-0 text-slate-400 ${it.status === 'uploading' ? 'animate-spin' : ''}`} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-slate-700">{it.name}</span>
                  {it.status === 'failed' && <span className="shrink-0 text-xs text-red-600">{it.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href="/#family-album" className="inline-block text-red-600 underline underline-offset-4">
          See the photo gallery
        </Link>
      </div>
    </main>
  );
}
