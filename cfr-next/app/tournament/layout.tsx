import type { Metadata } from 'next';

// Preview area: not linked from the home page yet, and kept out of search results.
export const metadata: Metadata = {
  title: 'Tournaments · Churchwell Family Reunion',
  description: 'Cornhole and horseshoes brackets, live scores, and champions.',
  robots: { index: false, follow: false },
};

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
