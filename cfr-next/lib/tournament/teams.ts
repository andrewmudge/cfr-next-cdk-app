import type { Participant, Rng, Team } from './types';

/** Fisher–Yates shuffle with an injectable random source (crypto on the server, seeded in tests). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Who can be put on a team: not excluded and has a recorded gender. Missing gender = needs admin review. */
export const isEligible = (p: Participant) => !p.excluded && (p.gender === 'M' || p.gender === 'F');
export const needsReview = (p: Participant) => !p.excluded && p.gender !== 'M' && p.gender !== 'F';

/**
 * Random mixed-gender teams: shuffle the men and the women separately, then pair them up.
 * Whoever is left over (the larger group's surplus) is returned as `extras`.
 */
export function generateTeams(
  participants: readonly Participant[],
  rng: Rng,
  firstTeamNo = 1
): { teams: Team[]; extras: string[]; nextTeamNo: number } {
  const eligible = participants.filter(isEligible);
  const men = shuffle(eligible.filter((p) => p.gender === 'M'), rng);
  const women = shuffle(eligible.filter((p) => p.gender === 'F'), rng);
  const pairs = Math.min(men.length, women.length);
  const teams: Team[] = [];
  let no = firstTeamNo;
  for (let i = 0; i < pairs; i++) {
    teams.push({ id: `t${no++}`, maleId: men[i].personId, femaleId: women[i].personId });
  }
  const extras = [...men.slice(pairs), ...women.slice(pairs)].map((p) => p.personId);
  return { teams, extras, nextTeamNo: no };
}
