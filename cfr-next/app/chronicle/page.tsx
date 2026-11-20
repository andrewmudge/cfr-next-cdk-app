import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import ChronicleForm from '@/components/chronicle/ChronicleForm';
import { CHRONICLE_NAME, currentIssue, issueInfo } from '@/lib/chronicle/issues';
import { listPublishedIssues } from '@/lib/chronicle/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const issue = currentIssue();
  const title = `${CHRONICLE_NAME} — share your news`;
  const description = `Send a family update and photos for the ${issue.label} edition (out ${issue.dateLabel}).`;
  return { title, description, openGraph: { title, description, siteName: 'Churchwell Family Reunion', type: 'website' } };
}

export default async function ChroniclePage() {
  const issue = currentIssue();
  let past: { issueId: string }[] = [];
  try {
    past = await listPublishedIssues();
  } catch (err) {
    console.error('Chronicle: could not list past issues', err);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
        <Link href="/" className="inline-flex items-center text-sm text-slate-300 hover:text-white">
          <ArrowLeft className="mr-1 h-4 w-4" /> churchwellreunion.com
        </Link>

        <header className="mt-6 mb-8 text-center">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-white leading-tight">{CHRONICLE_NAME}</h1>
          <div className="mx-auto my-4 h-1 w-24 rounded bg-red-600" />
          <p className="text-lg text-slate-300">
            What&apos;s happened since the last one? Share your news and photos for the <strong className="text-white">{issue.label}</strong> edition,
            out {issue.dateLabel}.
          </p>
        </header>

        <ChronicleForm issue={issue} />

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 text-xl font-bold text-white">Past issues</h2>
            <ul className="space-y-2">
              {past.map((p) => {
                const info = issueInfo(p.issueId);
                return (
                  <li key={p.issueId}>
                    <a
                      href={`/chronicle/${p.issueId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[56px] items-center gap-3 rounded-xl bg-slate-800 px-4 text-slate-100 border border-slate-700 hover:border-red-500"
                    >
                      <FileText className="h-5 w-5 text-red-400" />
                      <span className="font-medium">{info.label}</span>
                      <span className="ml-auto text-sm text-slate-400">{info.dateLabel}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
