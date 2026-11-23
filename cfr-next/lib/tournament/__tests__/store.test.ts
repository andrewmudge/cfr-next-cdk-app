import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { runCommand, loadTournament, listEvents } from '../store';
import { newTournament } from '../engine';
import { admin, manager, people, nextReady } from './helpers';

// In-memory stand-in for the ReunionRegistrations table that honours the same version condition.
const ddb = mockClient(DynamoDBDocumentClient);
let table: Map<string, Record<string, unknown>>;
let writes = 0;
const key = (k: { year: string; sk: string }) => `${k.year}|${k.sk}`;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  table = new Map();
  writes = 0;
  ddb.reset();
  ddb.on(GetCommand).callsFake(async (input) => {
    await tick(); // let concurrent callers read the same version
    const item = table.get(key(input.Key));
    return { Item: item ? structuredClone(item) : undefined };
  });
  ddb.on(TransactWriteCommand).callsFake(async (input) => {
    await tick();
    const items = input.TransactItems as { Put: { Item: Record<string, unknown>; ConditionExpression?: string; ExpressionAttributeValues?: Record<string, unknown> } }[];
    // Check every condition first (all-or-nothing, like DynamoDB).
    for (const { Put } of items) {
      const cur = table.get(key(Put.Item as { year: string; sk: string }));
      const cond = Put.ConditionExpression;
      const ok =
        !cond ||
        (cond === 'attribute_not_exists(sk)' && !cur) ||
        (cond === 'version = :v' && cur?.version === Put.ExpressionAttributeValues?.[':v']);
      if (!ok) {
        const e = new Error('cancelled') as Error & { CancellationReasons: { Code: string }[] };
        e.name = 'TransactionCanceledException';
        e.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw e;
      }
    }
    for (const { Put } of items) table.set(key(Put.Item as { year: string; sk: string }), structuredClone(Put.Item));
    writes++;
    return {};
  });
  ddb.on(QueryCommand).callsFake(async (input) => {
    const pk = input.ExpressionAttributeValues[':y'];
    const prefix = input.ExpressionAttributeValues[':p'];
    const items = [...table.values()].filter((i) => i.year === pk && String(i.sk).startsWith(prefix));
    return { Items: items };
  });
});

async function seedStarted(men = 8, women = 8) {
  const y = '2099';
  const g = 'cornhole' as const;
  await runCommand(y, g, admin, { type: 'importSignups', signups: people(men, women) }, { createIfMissing: true });
  await runCommand(y, g, admin, { type: 'generateTeams' });
  await runCommand(y, g, admin, { type: 'makePlan' });
  await runCommand(y, g, admin, { type: 'publish' });
  await runCommand(y, g, manager, { type: 'start' });
  return (await loadTournament(y, g))!;
}

describe('store', () => {
  it('creates on the first admin command, stores state and audit events together', async () => {
    const s = await seedStarted();
    expect(s.status).toBe('IN_PROGRESS');
    expect(s.version).toBe(5);
    const events = await listEvents('2099', 'cornhole');
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['participants_imported', 'teams_generated', 'bracket_previewed', 'published', 'started'])
    );
  });

  it('managers cannot create a tournament', async () => {
    await expect(runCommand('2099', 'cornhole', manager, { type: 'start' }, { createIfMissing: true })).rejects.toThrow(/not been set up/);
  });

  it('11/12. two managers finishing the same game at once: one advancement, second is a harmless repeat', async () => {
    const s = await seedStarted();
    const m = nextReady(s);
    const cmd = { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 9 } as const;
    const before = writes;
    const [a, b] = await Promise.all([runCommand('2099', 'cornhole', manager, cmd), runCommand('2099', 'cornhole', manager, cmd)]);
    expect([a.changed, b.changed].sort()).toEqual([false, true]);
    expect(writes - before).toBe(1);
    const after = (await loadTournament('2099', 'cornhole'))!;
    const done = after.matches.find((x) => x.id === m.id)!;
    expect(done.completedSeq).toBe(1);
    const next = after.matches.find((x) => x.id === done.next!.matchId)!;
    expect(next[done.next!.slot].teamId).toBe(done.winnerTeamId);
  });

  it('11. conflicting results for the same game at once: one wins, the other gets a conflict', async () => {
    const s = await seedStarted();
    const m = nextReady(s);
    const results = await Promise.allSettled([
      runCommand('2099', 'cornhole', manager, { type: 'completeMatch', matchId: m.id, scoreA: 21, scoreB: 9 }),
      runCommand('2099', 'cornhole', manager, { type: 'completeMatch', matchId: m.id, scoreA: 9, scoreB: 21 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('conflict');
  });

  it('20. two managers on different games at once: both saved (second retries on fresh state)', async () => {
    const s = await seedStarted();
    const [m1, m2] = s.matches.filter((m) => m.status === 'ready').slice(0, 2);
    await Promise.all([
      runCommand('2099', 'cornhole', manager, { type: 'completeMatch', matchId: m1.id, scoreA: 21, scoreB: 1 }),
      runCommand('2099', 'cornhole', manager, { type: 'completeMatch', matchId: m2.id, scoreA: 1, scoreB: 21 }),
    ]);
    const after = (await loadTournament('2099', 'cornhole'))!;
    expect(after.matches.find((x) => x.id === m1.id)!.status).toBe('done');
    expect(after.matches.find((x) => x.id === m2.id)!.status).toBe('done');
    expect(after.completedSeq).toBe(2);
  });

  it('a stale client (old match version) is told someone else updated the game', async () => {
    const s = await seedStarted();
    const m = nextReady(s);
    await runCommand('2099', 'cornhole', manager, { type: 'startMatch', matchId: m.id });
    await expect(
      runCommand('2099', 'cornhole', manager, { type: 'saveScore', matchId: m.id, scoreA: 3, scoreB: 0 }, { matchId: m.id, expectedMatchVersion: m.version })
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('19. a spectator write is refused and nothing is stored', async () => {
    const s = await seedStarted();
    const before = writes;
    await expect(
      runCommand('2099', 'cornhole', { role: 'spectator', id: 'x' }, { type: 'completeMatch', matchId: nextReady(s).id, scoreA: 21, scoreB: 0 })
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(writes).toBe(before);
  });

  it('years and games are kept apart', async () => {
    await seedStarted();
    expect(await loadTournament('2099', 'horseshoes')).toBeNull();
    expect(await loadTournament('2098', 'cornhole')).toBeNull();
    expect(newTournament('2099', 'horseshoes', 'x').id).not.toBe(newTournament('2099', 'cornhole', 'x').id);
  });
});
