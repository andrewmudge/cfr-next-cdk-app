import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
  BatchGetCommand,
  UpdateCommand,
  type ScanCommandOutput,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  nameKey,
  normalizeName,
  titleCase,
  type ActivityId,
  type PublicPerson,
  type RegisteredPerson,
} from '@/lib/reunion-config';

// Same client setup as lib/dynamodb-server.ts (credentials from env / default chain).
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true },
});

const MEMBERS_TABLE = process.env.FAMILY_MEMBERS_TABLE || 'FamilyMembers';
const REG_TABLE = process.env.REGISTRATIONS_TABLE || 'ReunionRegistrations';

export interface FamilyMemberRecord {
  personId: string;
  givenName: string;
  familyName: string;
  nickname?: string;
  birthSurname?: string;
  displayName: string;
  nameKey: string;
  source: 'familytree' | 'signup2025' | 'registration';
  verified: boolean;
  deceased?: boolean;
  createdAt: string;
}

export interface SubmissionRecord {
  year: string;
  sk: string;
  submissionId: string;
  submitterPersonId: string;
  submitterName: string;
  email?: string;
  phone?: string;
  attendeeIds: string[];
  attendees: { personId: string; displayName: string; activities: ActivityId[] }[];
  notes?: string;
  createdAt: string;
}

// ---------- Family members (cached) ----------

let membersCache: { at: number; items: FamilyMemberRecord[] } | null = null;
const CACHE_MS = 60_000;

async function scanAll<T>(table: string): Promise<T[]> {
  const items: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: ScanCommandOutput = await docClient.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...((out.Items as T[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export async function listFamilyMemberRecords(force = false): Promise<FamilyMemberRecord[]> {
  if (!force && membersCache && Date.now() - membersCache.at < CACHE_MS) return membersCache.items;
  const items = await scanAll<FamilyMemberRecord>(MEMBERS_TABLE);
  membersCache = { at: Date.now(), items };
  return items;
}

export async function listPublicPeople(): Promise<PublicPerson[]> {
  const items = await listFamilyMemberRecords();
  return items
    .filter((m) => !m.deceased)
    .map((m) => ({
      id: m.personId,
      displayName: m.displayName,
      givenName: m.givenName,
      familyName: m.familyName,
      nickname: m.nickname || undefined,
      birthSurname: m.birthSurname && m.birthSurname !== m.familyName ? m.birthSurname : undefined,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function setMemberVerified(personId: string, verified: boolean) {
  await docClient.send(
    new UpdateCommand({
      TableName: MEMBERS_TABLE,
      Key: { personId },
      UpdateExpression: 'SET verified = :v',
      ConditionExpression: 'attribute_exists(personId)',
      ExpressionAttributeValues: { ':v': verified },
    })
  );
  membersCache = null;
}

// ---------- Registrations ----------

async function queryYear<T>(year: string, prefix: string): Promise<T[]> {
  const items: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: QueryCommandOutput = await docClient.send(
      new QueryCommand({
        TableName: REG_TABLE,
        KeyConditionExpression: '#y = :y AND begins_with(sk, :p)',
        ExpressionAttributeNames: { '#y': 'year' },
        ExpressionAttributeValues: { ':y': year, ':p': prefix },
        ExclusiveStartKey,
      })
    );
    items.push(...((out.Items as T[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export async function getRegisteredPeople(year: string): Promise<RegisteredPerson[]> {
  const rows = await queryYear<RegisteredPerson & { activities: ActivityId[] }>(year, 'PERSON#');
  return rows.map(({ personId, displayName, submittedByName, createdAt }) => ({
    personId,
    displayName,
    submittedByName,
    createdAt,
  }));
}

export async function getRegisteredPerson(year: string, personId: string): Promise<RegisteredPerson | null> {
  const out = await docClient.send(
    new QueryCommand({
      TableName: REG_TABLE,
      KeyConditionExpression: '#y = :y AND sk = :sk',
      ExpressionAttributeNames: { '#y': 'year' },
      ExpressionAttributeValues: { ':y': year, ':sk': `PERSON#${personId}` },
    })
  );
  const row = out.Items?.[0] as RegisteredPerson | undefined;
  return row
    ? { personId: row.personId, displayName: row.displayName, submittedByName: row.submittedByName, createdAt: row.createdAt }
    : null;
}

export async function listSubmissions(year: string): Promise<SubmissionRecord[]> {
  const rows = await queryYear<SubmissionRecord>(year, 'SUBMISSION#');
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------- Create registration ----------

export type PersonRef = { personId: string } | { newName: { given: string; family: string } };

export interface RegistrationInput {
  year: string;
  submitter: PersonRef;
  email?: string;
  phone?: string;
  attendees: { person: PersonRef; activities: ActivityId[] }[];
  notes?: string;
}

export type RegistrationResult =
  | { ok: true; submissionId: string; attendees: { personId: string; displayName: string; activities: ActivityId[] }[] }
  | { ok: false; reason: 'already_registered'; alreadyRegistered: RegisteredPerson[] }
  | { ok: false; reason: 'invalid'; message: string };

const slug = (s: string) => normalizeName(s).replace(/\s+/g, '-');

/**
 * Resolve a PersonRef to an existing member, or build a new (unverified) member.
 * New names that match an existing member's nameKey reuse that member, so the
 * same person can't be registered twice by typing their name slightly differently.
 */
function resolvePerson(
  ref: PersonRef,
  byId: Map<string, FamilyMemberRecord>,
  byKey: Map<string, FamilyMemberRecord>,
  pendingNew: Map<string, FamilyMemberRecord>,
  now: string
): FamilyMemberRecord | null {
  if ('personId' in ref) return byId.get(ref.personId) ?? null;
  const given = titleCase(ref.newName.given.trim().replace(/\s+/g, ' '));
  const family = titleCase(ref.newName.family.trim().replace(/\s+/g, ' '));
  if (!given) return null;
  const key = nameKey(given, family);
  const existing = byKey.get(key) ?? pendingNew.get(key);
  if (existing) return existing;
  const rec: FamilyMemberRecord = {
    personId: `rg_${slug(key)}`,
    givenName: given,
    familyName: family,
    displayName: `${given} ${family}`.trim(),
    nameKey: key,
    source: 'registration',
    verified: false,
    createdAt: now,
  };
  pendingNew.set(key, rec);
  return rec;
}

export async function createRegistration(input: RegistrationInput): Promise<RegistrationResult> {
  const now = new Date().toISOString();
  const members = await listFamilyMemberRecords(true);
  const byId = new Map(members.map((m) => [m.personId, m]));
  const byKey = new Map(members.map((m) => [m.nameKey, m]));
  const pendingNew = new Map<string, FamilyMemberRecord>();

  const submitter = resolvePerson(input.submitter, byId, byKey, pendingNew, now);
  if (!submitter) return { ok: false, reason: 'invalid', message: 'We could not find your name. Please pick it again.' };

  const attendees: { member: FamilyMemberRecord; activities: ActivityId[] }[] = [];
  const seen = new Set<string>();
  for (const a of input.attendees) {
    const member = resolvePerson(a.person, byId, byKey, pendingNew, now);
    if (!member) return { ok: false, reason: 'invalid', message: 'One of the names could not be found. Please pick it again.' };
    if (seen.has(member.personId)) {
      return { ok: false, reason: 'invalid', message: `${member.displayName} is listed twice.` };
    }
    seen.add(member.personId);
    attendees.push({ member, activities: Array.from(new Set(a.activities)) });
  }

  // Pre-check so we can report all conflicts at once (the transaction conditions
  // below still guarantee no duplicates under concurrent submits).
  const conflicts = await findRegistered(input.year, attendees.map((a) => a.member.personId));
  if (conflicts.length) return { ok: false, reason: 'already_registered', alreadyRegistered: conflicts };

  const submissionId = randomUUID();
  const attendeeSummary = attendees.map((a) => ({
    personId: a.member.personId,
    displayName: a.member.displayName,
    activities: a.activities,
  }));

  const personItems = attendees.map((a) => ({
    Put: {
      TableName: REG_TABLE,
      Item: {
        year: input.year,
        sk: `PERSON#${a.member.personId}`,
        personId: a.member.personId,
        displayName: a.member.displayName,
        activities: a.activities,
        submissionId,
        submittedByName: submitter.displayName,
        createdAt: now,
      },
      ConditionExpression: 'attribute_not_exists(sk)',
    },
  }));

  const submissionItem: SubmissionRecord = {
    year: input.year,
    sk: `SUBMISSION#${submissionId}`,
    submissionId,
    submitterPersonId: submitter.personId,
    submitterName: submitter.displayName,
    email: input.email || undefined,
    phone: input.phone || undefined,
    attendeeIds: attendeeSummary.map((a) => a.personId),
    attendees: attendeeSummary,
    notes: input.notes || undefined,
    createdAt: now,
  };

  const memberItems = Array.from(pendingNew.values()).map((m) => ({
    Put: { TableName: MEMBERS_TABLE, Item: m },
  }));

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [...personItems, { Put: { TableName: REG_TABLE, Item: submissionItem } }, ...memberItems],
      })
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'TransactionCanceledException') {
      // Someone registered one of these people between our pre-check and the write.
      const raced = await findRegistered(input.year, attendees.map((a) => a.member.personId));
      if (raced.length) return { ok: false, reason: 'already_registered', alreadyRegistered: raced };
    }
    throw err;
  }

  if (pendingNew.size) membersCache = null;
  return { ok: true, submissionId, attendees: attendeeSummary };
}

async function findRegistered(year: string, personIds: string[]): Promise<RegisteredPerson[]> {
  const found: RegisteredPerson[] = [];
  for (let i = 0; i < personIds.length; i += 100) {
    const keys = personIds.slice(i, i + 100).map((id) => ({ year, sk: `PERSON#${id}` }));
    let request: Record<string, { Keys: Record<string, unknown>[] }> | undefined = { [REG_TABLE]: { Keys: keys } };
    while (request && Object.keys(request).length) {
      const out = await docClient.send(new BatchGetCommand({ RequestItems: request }));
      for (const row of (out.Responses?.[REG_TABLE] ?? []) as RegisteredPerson[]) {
        found.push({
          personId: row.personId,
          displayName: row.displayName,
          submittedByName: row.submittedByName,
          createdAt: row.createdAt,
        });
      }
      request = out.UnprocessedKeys as typeof request;
    }
  }
  return found;
}
