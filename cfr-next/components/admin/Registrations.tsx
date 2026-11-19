'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ClipboardList, Download, Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ACTIVITIES, type ActivityId } from '@/lib/reunion-config';

interface Submission {
  submissionId: string;
  submitterName: string;
  email?: string;
  phone?: string;
  attendees: { personId: string; displayName: string; activities: ActivityId[] }[];
  notes?: string;
  createdAt: string;
}

interface Unverified {
  personId: string;
  displayName: string;
  createdAt: string;
}

const fmt = (iso: string) => {
  try {
    return format(new Date(iso), 'MMM d, h:mm a');
  } catch {
    return iso;
  }
};

const csvCell = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function Registrations() {
  const [year, setYear] = useState('');
  const [subs, setSubs] = useState<Submission[]>([]);
  const [unverified, setUnverified] = useState<Unverified[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/registrations', { cache: 'no-store' });
      if (res.status === 401) throw new Error('Not authorized. Try signing out and back in.');
      if (!res.ok) throw new Error('Could not load registrations.');
      const data = await res.json();
      setYear(data.year);
      setSubs(data.submissions);
      setUnverified(data.unverified);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const people = useMemo(
    () => subs.flatMap((s) => s.attendees.map((a) => ({ ...a, submitterName: s.submitterName, s }))),
    [subs]
  );

  const counts = useMemo(
    () => ACTIVITIES.map((a) => ({ ...a, count: people.filter((p) => p.activities.includes(a.id)).length })),
    [people]
  );

  const downloadCsv = () => {
    const header = ['Name', ...ACTIVITIES.map((a) => a.label), 'Signed up by', 'Email', 'Phone', 'Notes', 'Submitted'];
    const rows = people.map((p) => [
      p.displayName,
      ...ACTIVITIES.map((a) => (p.activities.includes(a.id) ? 'Y' : '')),
      p.submitterName,
      p.s.email ?? '',
      p.s.phone ?? '',
      p.s.notes ?? '',
      p.s.createdAt,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfr-${year}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verify = async (personId: string) => {
    const res = await fetch(`/api/admin/people/${encodeURIComponent(personId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: true }),
    });
    if (res.ok) {
      setUnverified((u) => u.filter((x) => x.personId !== personId));
      toast.success('Name verified');
    } else {
      toast.error('Could not verify');
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-red-400" />
          {year} Sign-Ups
          {!loading && <span className="text-gray-400 font-normal text-base">({people.length} people, {subs.length} families)</span>}
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="border-slate-500 text-slate-200 hover:bg-slate-700">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={downloadCsv} disabled={!people.length} className="bg-green-600 hover:bg-green-700 text-white">
            <Download className="w-4 h-4 mr-1" /> Download CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      ) : error ? (
        <p className="text-red-300">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {counts.map((c) => (
              <div key={c.id} className="rounded-lg bg-slate-900 p-4 text-center border border-slate-700">
                <div className="text-2xl">{c.emoji}</div>
                <div className="text-2xl font-bold text-white">{c.count}</div>
                <div className="text-xs text-gray-400">{c.label}</div>
              </div>
            ))}
          </div>

          {unverified.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-amber-200 font-semibold mb-2">New names added at sign-up ({unverified.length})</p>
              <ul className="space-y-2">
                {unverified.map((u) => (
                  <li key={u.personId} className="flex items-center justify-between text-sm text-amber-100">
                    <span>
                      {u.displayName} <span className="text-amber-300/70">· {fmt(u.createdAt)}</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => verify(u.personId)} className="border-amber-400 text-amber-200 hover:bg-amber-500/20 h-8">
                      <UserCheck className="w-4 h-4 mr-1" /> Looks right
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {subs.length === 0 ? (
            <p className="text-gray-400">No sign-ups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs uppercase text-gray-400 border-b border-slate-700">
                  <tr>
                    <th className="py-2 pr-4">Signed up by</th>
                    <th className="py-2 pr-4">Contact</th>
                    <th className="py-2 pr-4">People & activities</th>
                    <th className="py-2 pr-4">When</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.submissionId} className="border-b border-slate-700/60 align-top">
                      <td className="py-3 pr-4 font-medium text-white">{s.submitterName}</td>
                      <td className="py-3 pr-4">
                        {s.email && <div>{s.email}</div>}
                        {s.phone && <div>{s.phone}</div>}
                      </td>
                      <td className="py-3 pr-4">
                        <ul className="space-y-1">
                          {s.attendees.map((a) => (
                            <li key={a.personId}>
                              <span className="text-white">{a.displayName}</span>{' '}
                              <span className="text-gray-400">
                                {a.activities.length
                                  ? ACTIVITIES.filter((x) => a.activities.includes(x.id)).map((x) => x.emoji).join(' ')
                                  : '-'}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {s.notes && <p className="mt-2 italic text-gray-400">&ldquo;{s.notes}&rdquo;</p>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">{fmt(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
