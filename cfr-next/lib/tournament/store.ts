// Persistence: one item per tournament in the existing ReunionRegistrations table (like site settings),
// plus one item per audit event. Partition key `year` = "TOURNAMENT#<year>#<game>".
//
// Every change is a single TransactWrite: Put STATE (only if its version is still the one we read)
// + Put the audit events. Two managers can never both advance a winner; a write that loses the race
// is retried against the fresh state (fine when they touched different games) or reported as a conflict.

import { randomBytes, randomInt } from 'crypto';
import { DeleteCommand, GetCommand, QueryCommand, TransactWriteCommand, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@/lib/reunion-db';
import { apply, findMatch, newTournament, type Command } from './engine';
import { TournamentError, type Actor, type GameId, type TournamentEvent, type TournamentState } from './types';

const TABLE = process.env.REGISTRATIONS_TABLE || 'ReunionRegistrations';
export const tournamentKey = (year: string, game: GameId) => `TOURNAMENT#${year}#${game}`;
const STATE_SK = 'STATE';
const MAX_ATTEMPTS = 3;

export const serverRng = (max: number) => randomInt(Math.max(1, max));

interface StoredState {
  year: string;
  sk: string;
  version: number;
  status: string;
  updatedAt: string;
  data: string; // JSON TournamentState
}

export async function loadTournament(year: string, game: GameId): Promise<TournamentState | null> {
  const out = await docClient.send(
    new GetCommand({ TableName: TABLE, Key: { year: tournamentKey(year, game), sk: STATE_SK }, ConsistentRead: true })
  );
  const item = out.Item as StoredState | undefined;
  return item ? (JSON.parse(item.data) as TournamentState) : null;
}

export interface RunOptions {
  /** Client's view of the match version; a mismatch means someone else changed that game first. */
  expectedMatchVersion?: number;
  matchId?: string;
  /** Admins create the tournament on their first setup command. */
  createIfMissing?: boolean;
}

const isConditionFailure = (e: unknown) => {
  const err = e as { name?: string; CancellationReasons?: { Code?: string }[] };
  return (
    err.name === 'ConditionalCheckFailedException' ||
    (err.name === 'TransactionCanceledException' && (err.CancellationReasons ?? []).some((r) => r?.Code === 'ConditionalCheckFailed'))
  );
};

export async function runCommand(
  year: string,
  game: GameId,
  actor: Actor,
  cmd: Command,
  opts: RunOptions = {}
): Promise<{ state: TournamentState; changed: boolean }> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const now = new Date().toISOString();
    const loaded = await loadTournament(year, game);
    if (!loaded && !(opts.createIfMissing && actor.role === 'admin')) {
      throw new TournamentError('This tournament has not been set up yet.', 'not_found');
    }
    const prev = loaded ?? newTournament(year, game, now);

    if (opts.matchId !== undefined && opts.expectedMatchVersion !== undefined) {
      const m = findMatch(prev, opts.matchId);
      if (m && m.version !== opts.expectedMatchVersion) {
        throw new TournamentError('Someone else just updated this game. Check the latest score and try again.', 'conflict');
      }
    }

    const result = apply(prev, cmd, actor, { now, rng: serverRng });
    if (!result.changed && loaded) return { state: prev, changed: false };

    try {
      await docClient.send(new TransactWriteCommand({ TransactItems: writeItems(year, game, loaded, result.state, result.events) }));
      return { state: result.state, changed: true };
    } catch (e) {
      if (isConditionFailure(e) && attempt < MAX_ATTEMPTS) continue; // someone else wrote first: re-read and re-apply
      if (isConditionFailure(e)) throw new TournamentError('Lots of updates at once. Please try again.', 'conflict');
      throw e;
    }
  }
  throw new TournamentError('Please try again.', 'conflict');
}

function writeItems(year: string, game: GameId, prev: TournamentState | null, next: TournamentState, events: TournamentEvent[]) {
  const pk = tournamentKey(year, game);
  const stateItem: StoredState = {
    year: pk,
    sk: STATE_SK,
    version: next.version,
    status: next.status,
    updatedAt: next.updatedAt,
    data: JSON.stringify(next),
  };
  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
    {
      Put: {
        TableName: TABLE,
        Item: stateItem as unknown as Record<string, unknown>,
        ...(prev
          ? { ConditionExpression: 'version = :v', ExpressionAttributeValues: { ':v': prev.version } }
          : { ConditionExpression: 'attribute_not_exists(sk)' }),
      },
    },
  ];
  // DynamoDB transactions hold up to 100 items; a single command logs only a handful of events.
  for (const e of events.slice(0, 90)) {
    items.push({
      Put: {
        TableName: TABLE,
        Item: { year: pk, sk: `EVENT#${e.at}#${randomBytes(4).toString('hex')}`, ...e, version: next.version },
      },
    });
  }
  return items;
}

export async function listEvents(year: string, game: GameId, limit = 300): Promise<(TournamentEvent & { sk: string })[]> {
  const items: (TournamentEvent & { sk: string })[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: QueryCommandOutput = await docClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: '#y = :y AND begins_with(sk, :p)',
        ExpressionAttributeNames: { '#y': 'year' },
        ExpressionAttributeValues: { ':y': tournamentKey(year, game), ':p': 'EVENT#' },
        ScanIndexForward: false,
        ExclusiveStartKey,
      })
    );
    items.push(...((out.Items as (TournamentEvent & { sk: string })[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < limit);
  return items.slice(0, limit);
}

/** Admin only, and only for drafts/cancelled tournaments (e.g. practice runs). Removes state and its log. */
export async function removeTournament(year: string, game: GameId) {
  const s = await loadTournament(year, game);
  if (!s) return false;
  if (s.status !== 'DRAFT' && s.status !== 'CANCELLED') {
    throw new TournamentError('Cancel the tournament before deleting it.');
  }
  const pk = tournamentKey(year, game);
  const events = await listEvents(year, game, 10_000);
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { year: pk, sk: STATE_SK },
      ConditionExpression: 'version = :v',
      ExpressionAttributeValues: { ':v': s.version },
    })
  );
  for (const e of events) await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { year: pk, sk: e.sk } }));
  return true;
}
