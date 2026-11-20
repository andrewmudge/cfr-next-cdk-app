import type { Metadata } from 'next';
import Link from 'next/link';
import FamilyTree from '@/components/family/FamilyTree';

export const metadata: Metadata = {
  title: 'Original Family Tree (Archive) | Churchwell Family Reunion',
  robots: { index: false },
};

// The original Family Echo tree, kept for reference. It is no longer updated:
// the family tree in the Family Album is edited on the site now.
export default function FamilyTreeArchivePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <Link href="/#family-tree" className="text-sm text-red-600 underline underline-offset-4">
          ← Back to the family tree
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Original Family Tree (Archive)</h1>
          <p className="text-slate-600">
            The family tree as it was kept in Family Echo. It isn&apos;t updated anymore; the current tree is in the Family Album.
          </p>
        </div>
        <FamilyTree />
      </div>
    </main>
  );
}
