import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import TournamentSetup from '@/components/tournament/TournamentSetup';
import { isGameId } from '@/lib/tournament/types';

export default async function SetupPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return (
    <Suspense>
      <TournamentSetup game={game} />
    </Suspense>
  );
}
