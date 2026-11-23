import { Suspense } from 'react';
import TournamentLanding from '@/components/tournament/TournamentLanding';

export default function TournamentsPage() {
  return (
    <Suspense>
      <TournamentLanding />
    </Suspense>
  );
}
