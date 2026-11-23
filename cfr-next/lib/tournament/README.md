# Tournaments (Cornhole, Horseshoes)

Mixed-gender, single-elimination tournaments with the Churchwell first-loser wildcard rule.
Lives at `/tournament` (noindex, not linked from the home page yet).

## Code map
| File | What it does |
|---|---|
| `types.ts` | State types and the `GAMES` registry. Add a game here. |
| `teams.ts` | Random teams of one man and one woman (Fisher–Yates with an injectable RNG). |
| `plan.ts` | Bracket planning: byes and wildcard placement. |
| `engine.ts` | Every command and rule (pure, no I/O). `REQUIRED_ROLE` lists who may run each one. |
| `view.ts` | What the browser gets (names only, never the password hash). |
| `store.ts` | DynamoDB: one STATE item plus EVENT items per tournament, with conditional writes. |
| `auth.ts` | Admin (Cognito, `lib/admin-emails.ts`) or manager (password and signed cookie). |
| `client.ts` | Browser polling hook and `sendCommand`. |

UI: `components/tournament/*` and `app/tournament/*`. API: `app/api/tournaments/*`. Tests: `npm test`.

## Data
The data lives in the existing `ReunionRegistrations` table, with no new infrastructure. The partition key `year` is set to `TOURNAMENT#<year>#<game>`:
- `sk = STATE`: the whole tournament as JSON, plus a `version` number. Every change is a single TransactWrite that saves STATE only if `version` hasn't changed since it was read, and adds the audit EVENT items in the same transaction. A write that loses a race is retried against the fresh state, up to 3 times.
- `sk = EVENT#<iso>#<rand>`: the audit log.

Participants come from that year's sign-ups (`PERSON#` rows whose activities include the game). Gender comes from the sign-up, then from the person's profile. Anyone with no recorded gender is marked "needs a gender" and is never paired. The admin can add walk-ups from the family list.

## Rules as built
- **Teams:** men and women are shuffled separately, then paired. Leftovers are "extras".
- **Bracket size:** the next power of two at or above (teams + wildcards). Byes are spread evenly through round 1, so no game has two. A bye moves its team forward with no score.
- **Wildcards (house rule):** each extra waits for a teammate. The teammate is the first player of the other gender to be knocked out, by the order games finished. There is one wildcard per extra. Example: 10 men and 7 women gives 7 teams and 3 extra men, and the first 3 women knocked out each re-enter.
  - The planner places each wildcard in a round-1 game (played after the regular round-1 games) if enough games come first. Otherwise it puts the wildcard on a round-1 bye, so its first game is in round 2.
  - It simulates the worst case (a game involving a wildcard frees nobody) to make sure every wildcard can be filled in time.
  - If not every extra fits, as many as fit become wildcards and the rest are **alternates**. The setup screen says so. The admin can also choose "Make them alternates instead".
  - A game with an unfilled wildcard can't start. The manager confirms the suggested player, or records "declined" and picks the next eligible loser or an alternate.
  - The server enforces the rest: the teammate must be the right gender, have lost a game, not be on an active team, and not have re-entered already.
- **Scoring:** the manager starts a game, taps the score up or down (it autosaves for spectators), and then confirms **Finish game**. Reaching the target score never ends a game on its own. Ties are refused. Finishing a game twice with the same score does nothing.
- **Fixing results:**
  - A manager can fix a result until the winner's next game starts. The right team then moves on.
  - After that, only an admin can fix it, by **rolling back** the later games. Everything is logged.
  - A fix is refused if it would put someone who re-entered as a wildcard on two teams.
- **Lifecycle:** DRAFT (setup, admin only) → READY (published, locked) → IN_PROGRESS ⇄ PAUSED → COMPLETED, which happens automatically when the final is finished. The admin can cancel, reopen or delete (delete works for drafts and cancelled tournaments only).

## Running one
1. Sign in as an admin and go to `/tournament`, then **Admin: set up cornhole**.
2. Import sign-ups. Fix anyone marked "needs a gender", and add any walk-ups.
3. Make random teams. To swap two players, tap one, then tap another of the same gender.
4. Preview the bracket (re-roll it if you like), then publish.
5. Set a manager password and give it to the manager. On their phone they open the tournament page, tap **Manage** and enter it.
6. Start the tournament. The manager taps a game, scores it, then taps Finish.

To practise first, use the year 2099: `/tournament?year=2099`. Delete it from setup when you're done.

## Config
Manager cookies are signed with `TOURNAMENT_SECRET`, falling back to `COGNITO_JWT_SECRET`. If neither is set, the Manage button is hidden and manager sign-in returns 503.
