import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import TournamentDetail from '@/components/tournament/TournamentDetail';
import { isGameId } from '@/lib/tournament/types';

export default async function TournamentPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return (
    <Suspense>
      <TournamentDetail game={game} />
    </Suspense>
  );
}
