import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import MatchControl from '@/components/tournament/MatchControl';
import { isGameId } from '@/lib/tournament/types';

export default async function MatchPage({ params }: { params: Promise<{ game: string; matchId: string }> }) {
  const { game, matchId } = await params;
  if (!isGameId(game) || !/^r\d+m\d+$/.test(matchId)) notFound();
  return (
    <Suspense>
      <MatchControl game={game} matchId={matchId} />
    </Suspense>
  );
}
