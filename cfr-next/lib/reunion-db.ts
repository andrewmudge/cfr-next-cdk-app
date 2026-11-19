import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
  BatchGetCommand,
  GetCommand,
  UpdateCommand,
  type ScanCommandOutput,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  allowedActivities,
  familyDues,
  nameKey,
  normalizeName,
  personDuesCents,
  titleCase,
  type ActivityId,
  type AdultRateId,
  type AgeGroupId,
  type DuesLine,
  type PublicPerson,
  type RegisteredPerson,
} from '@/lib/reunion-config';

// Same client setup as lib/dynamodb-server.ts (credentials from env / default chain).
export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true },
});

export const MEMBERS_TABLE = process.env.FAMILY_MEMBERS_TABLE || 'FamilyMembers';
const REG_TABLE = process.env.REGISTRATIONS_TABLE || 'ReunionRegistrations';

export interface FamilyMemberRecord {
  personId: string;
  givenName: string;
  familyName: string;
  nickname?: string;
  birthSurname?: string;
  displayName: string;
  nameKey: string;
  source: 'familytree' | 'signup2025' | 'account' | 'registration' | 'tree';
  verified: boolean;
  /** Server-only. Never returned by public endpoints (see listPublicPeople / getContactHint). */
  email?: string;
  phone?: string; // E.164, e.g. +16615551234
  deceased?: boolean;
  createdAt: string;

  // ---- Family tree (edited on the site by the admin) ----
  inTree?: boolean;
  motherId?: string;
  fatherId?: string;
  /** Current partner first. Stored on both people. */
  partnerIds?: string[];
  /** Stored on both people. */
  friendIds?: string[];
  gender?: 'M' | 'F';
  born?: number;
  died?: number;
  updatedAt?: string;
  updatedBy?: string;
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
  attendees: RegisteredAttendee[];
  dogs?: number;
  duesTotalCents?: number;
  /** Phase 2 (Stripe) will move this to 'paid'. */
  paymentStatus?: 'unpaid' | 'paid';
  notes?: string;
  createdAt: string;
}

export interface RegisteredAttendee {
  personId: string;
  displayName: string;
  activities: ActivityId[];
  ageGroup?: AgeGroupId; // missing on sign-ups made before age groups existed
  adultRate?: AdultRateId;
  duesCents?: number;
}

// ---------- Family members (cached) ----------

let membersCache: { at: number; items: FamilyMemberRecord[] } | null = null;
export const invalidateMembersCache = () => {
  membersCache = null;
};
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

const maskEmail = (e: string) => {
  const [user, domain] = e.split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
};
const maskPhone = (p: string) => `(•••) •••-${p.replace(/\D/g, '').slice(-4)}`;

/** Masked contact info for a person, so the public form can say "we have this on file". */
export async function getContactHint(personId: string): Promise<{ email?: string; phone?: string } | null> {
  const m = (await listFamilyMemberRecords()).find((x) => x.personId === personId);
  if (!m || (!m.email && !m.phone)) return null;
  return { email: m.email ? maskEmail(m.email) : undefined, phone: m.phone ? maskPhone(m.phone) : undefined };
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
  /** Use the submitter's email/phone on file instead of email/phone above. */
  useContactOnFile?: boolean;
  attendees: { person: PersonRef; ageGroup: AgeGroupId; adultRate?: AdultRateId; activities: ActivityId[] }[];
  dogs: number;
  notes?: string;
}

export type RegistrationResult =
  | { ok: true; submissionId: string; attendees: RegisteredAttendee[]; lines: DuesLine[]; totalCents: number }
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

  // Contact: what they typed, topped up with what's on file (e.g. on-file email + newly added phone).
  const email = input.email || (input.useContactOnFile ? submitter.email : undefined) || undefined;
  const phone = input.phone || (input.useContactOnFile ? submitter.phone : undefined) || undefined;
  if (!email && !phone) {
    return { ok: false, reason: 'invalid', message: 'Please add an email or phone number so we can reach you.' };
  }
  // Remember any newly typed contact info on the submitter's record (builds the master contact list).
  const contactChanged =
    (!!input.email && input.email !== submitter.email) || (!!input.phone && input.phone !== submitter.phone);
  if (contactChanged && pendingNew.has(submitter.nameKey)) {
    submitter.email = email ?? submitter.email;
    submitter.phone = phone ?? submitter.phone;
  }

  const attendees: {
    member: FamilyMemberRecord;
    ageGroup: AgeGroupId;
    adultRate?: AdultRateId;
    activities: ActivityId[];
  }[] = [];
  const seen = new Set<string>();
  for (const a of input.attendees) {
    const member = resolvePerson(a.person, byId, byKey, pendingNew, now);
    if (!member) return { ok: false, reason: 'invalid', message: 'One of the names could not be found. Please pick it again.' };
    if (seen.has(member.personId)) {
      return { ok: false, reason: 'invalid', message: `${member.displayName} is listed twice.` };
    }
    seen.add(member.personId);
    // Enforce game eligibility server-side (0–9: none, 10–17: no poker).
    const allowed = allowedActivities(a.ageGroup);
    attendees.push({
      member,
      ageGroup: a.ageGroup,
      adultRate: a.ageGroup === 'adult' ? a.adultRate ?? 'full' : undefined,
      activities: Array.from(new Set(a.activities)).filter((x) => allowed.includes(x)),
    });
  }

  // Pre-check so we can report all conflicts at once (the transaction conditions
  // below still guarantee no duplicates under concurrent submits).
  const conflicts = await findRegistered(input.year, attendees.map((a) => a.member.personId));
  if (conflicts.length) return { ok: false, reason: 'already_registered', alreadyRegistered: conflicts };

  const submissionId = randomUUID();
  const attendeeSummary: RegisteredAttendee[] = attendees.map((a) => ({
    personId: a.member.personId,
    displayName: a.member.displayName,
    activities: a.activities,
    ageGroup: a.ageGroup,
    adultRate: a.adultRate,
    duesCents: personDuesCents(a.ageGroup, a.adultRate),
  }));
  const dues = familyDues(
    attendees.map((a) => ({ displayName: a.member.displayName, ageGroup: a.ageGroup, adultRate: a.adultRate })),
    input.dogs
  );

  const personItems = attendees.map((a) => ({
    Put: {
      TableName: REG_TABLE,
      Item: {
        year: input.year,
        sk: `PERSON#${a.member.personId}`,
        personId: a.member.personId,
        displayName: a.member.displayName,
        activities: a.activities,
        ageGroup: a.ageGroup,
        adultRate: a.adultRate,
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
    email,
    phone,
    attendeeIds: attendeeSummary.map((a) => a.personId),
    attendees: attendeeSummary,
    dogs: input.dogs,
    duesTotalCents: dues.totalCents,
    paymentStatus: 'unpaid',
    notes: input.notes || undefined,
    createdAt: now,
  };

  const memberItems: Record<string, unknown>[] = Array.from(pendingNew.values()).map((m) => ({
    Put: { TableName: MEMBERS_TABLE, Item: m },
  }));
  if (contactChanged && !pendingNew.has(submitter.nameKey)) {
    const sets: string[] = [];
    const vals: Record<string, string> = {};
    if (email) {
      sets.push('email = :e');
      vals[':e'] = email;
    }
    if (phone) {
      sets.push('phone = :p');
      vals[':p'] = phone;
    }
    memberItems.push({
      Update: {
        TableName: MEMBERS_TABLE,
        Key: { personId: submitter.personId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeValues: vals,
      },
    });
  }

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

  if (pendingNew.size || contactChanged) membersCache = null;
  return { ok: true, submissionId, attendees: attendeeSummary, lines: dues.lines, totalCents: dues.totalCents };
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

// ---------- Admin: delete ----------

async function getSubmission(year: string, submissionId: string): Promise<SubmissionRecord | null> {
  const out = await docClient.send(
    new GetCommand({ TableName: REG_TABLE, Key: { year, sk: `SUBMISSION#${submissionId}` } })
  );
  return (out.Item as SubmissionRecord) ?? null;
}

/** Only delete a person's row if it still belongs to this submission. */
const deletePersonOp = (year: string, personId: string, submissionId: string) => ({
  Delete: {
    TableName: REG_TABLE,
    Key: { year, sk: `PERSON#${personId}` },
    ConditionExpression: 'attribute_not_exists(sk) OR submissionId = :sid',
    ExpressionAttributeValues: { ':sid': submissionId },
  },
});

/** Delete a whole family sign-up. Everyone on it can sign up again afterwards. */
export async function deleteSubmission(year: string, submissionId: string): Promise<boolean> {
  const sub = await getSubmission(year, submissionId);
  if (!sub) return false;
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: REG_TABLE, Key: { year, sk: `SUBMISSION#${submissionId}` } } },
        ...sub.attendeeIds.map((id) => deletePersonOp(year, id, submissionId)),
      ],
    })
  );
  return true;
}

/**
 * Remove one person from a family sign-up and recalculate the family's dues.
 * Removing the last person deletes the whole sign-up.
 */
export async function removeAttendee(
  year: string,
  submissionId: string,
  personId: string
): Promise<'removed' | 'deleted_submission' | 'not_found'> {
  const sub = await getSubmission(year, submissionId);
  if (!sub || !sub.attendeeIds.includes(personId)) return 'not_found';

  const remaining = sub.attendees.filter((a) => a.personId !== personId);
  if (remaining.length === 0) {
    await deleteSubmission(year, submissionId);
    return 'deleted_submission';
  }

  // Older sign-ups have no age groups; only recalculate when everyone left has one.
  const total = remaining.every((a) => a.ageGroup)
    ? familyDues(
        remaining.map((a) => ({ displayName: a.displayName, ageGroup: a.ageGroup!, adultRate: a.adultRate })),
        sub.dogs ?? 0
      ).totalCents
    : sub.duesTotalCents;

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: REG_TABLE,
            Key: { year, sk: `SUBMISSION#${submissionId}` },
            UpdateExpression: total === undefined
              ? 'SET attendees = :a, attendeeIds = :ids'
              : 'SET attendees = :a, attendeeIds = :ids, duesTotalCents = :t',
            ConditionExpression: 'contains(attendeeIds, :pid)',
            ExpressionAttributeValues: {
              ':a': remaining,
              ':ids': remaining.map((a) => a.personId),
              ':pid': personId,
              ...(total === undefined ? {} : { ':t': total }),
            },
          },
        },
        deletePersonOp(year, personId, submissionId),
      ],
    })
  );
  return 'removed';
}
