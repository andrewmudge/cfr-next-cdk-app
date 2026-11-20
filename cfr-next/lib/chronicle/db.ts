import { randomUUID } from 'crypto';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type QueryCommandOutput,
  type ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '@/lib/reunion-db';

// One partition per issue ("2027-01"): ENTRY#<createdAt>#<uuid> items plus a META item.
export const CHRONICLE_TABLE = process.env.CHRONICLE_TABLE || 'ChronicleEntries';
const META = 'META';

export interface ChroniclePhoto {
  key: string;
  width: number;
  height: number;
}

export type EntryStatus = 'submitted' | 'approved' | 'hidden';

export interface ChronicleEntry {
  issueId: string;
  sk: string;
  personId?: string;
  displayName: string;
  content: string;
  photos: ChroniclePhoto[];
  status: EntryStatus;
  /** Admin ordering; unset entries sort after ordered ones, oldest first. */
  order?: number;
  createdAt: string;
  updatedAt?: string;
}

export type IssueStatus = 'collecting' | 'final' | 'sent';

export interface ChronicleMeta {
  issueId: string;
  sk: typeof META;
  status: IssueStatus;
  /** Editor's note on the cover. */
  intro?: string;
  pdfKey?: string;
  pdfBytes?: number;
  finalizedAt?: string;
  sentAt?: string;
  broadcastId?: string;
}

const emptyMeta = (issueId: string): ChronicleMeta => ({ issueId, sk: META, status: 'collecting' });

export const sortEntries = (entries: ChronicleEntry[]) =>
  [...entries].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt)
  );

export async function createEntry(input: {
  issueId: string;
  personId?: string;
  displayName: string;
  content: string;
  photos: ChroniclePhoto[];
}): Promise<ChronicleEntry> {
  const createdAt = new Date().toISOString();
  const entry: ChronicleEntry = {
    ...input,
    sk: `ENTRY#${createdAt}#${randomUUID()}`,
    status: 'submitted',
    createdAt,
  };
  await docClient.send(new PutCommand({ TableName: CHRONICLE_TABLE, Item: entry }));
  return entry;
}

export async function getIssue(issueId: string): Promise<{ meta: ChronicleMeta; entries: ChronicleEntry[] }> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: QueryCommandOutput = await docClient.send(
      new QueryCommand({
        TableName: CHRONICLE_TABLE,
        KeyConditionExpression: 'issueId = :i',
        ExpressionAttributeValues: { ':i': issueId },
        ExclusiveStartKey,
      })
    );
    items.push(...(out.Items ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const meta = (items.find((i) => i.sk === META) as ChronicleMeta | undefined) ?? emptyMeta(issueId);
  const entries = sortEntries(items.filter((i) => String(i.sk).startsWith('ENTRY#')) as unknown as ChronicleEntry[]);
  return { meta, entries };
}

export async function getEntry(issueId: string, sk: string): Promise<ChronicleEntry | null> {
  const out = await docClient.send(new GetCommand({ TableName: CHRONICLE_TABLE, Key: { issueId, sk } }));
  return (out.Item as ChronicleEntry) ?? null;
}

export type EntryPatch = Partial<Pick<ChronicleEntry, 'displayName' | 'content' | 'photos' | 'status' | 'order'>>;

/** Update fields of an existing entry. Returns null if it doesn't exist. */
export async function updateEntry(issueId: string, sk: string, patch: EntryPatch): Promise<ChronicleEntry | null> {
  const fields = Object.entries({ ...patch, updatedAt: new Date().toISOString() }).filter(([, v]) => v !== undefined);
  try {
    const out = await docClient.send(
      new UpdateCommand({
        TableName: CHRONICLE_TABLE,
        Key: { issueId, sk },
        UpdateExpression: `SET ${fields.map((_, i) => `#k${i} = :v${i}`).join(', ')}`,
        ExpressionAttributeNames: Object.fromEntries(fields.map(([k], i) => [`#k${i}`, k])),
        ExpressionAttributeValues: Object.fromEntries(fields.map(([, v], i) => [`:v${i}`, v])),
        ConditionExpression: 'attribute_exists(sk)',
        ReturnValues: 'ALL_NEW',
      })
    );
    return out.Attributes as ChronicleEntry;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}

export async function deleteEntry(issueId: string, sk: string): Promise<ChronicleEntry | null> {
  const out = await docClient.send(
    new DeleteCommand({ TableName: CHRONICLE_TABLE, Key: { issueId, sk }, ReturnValues: 'ALL_OLD' })
  );
  return (out.Attributes as ChronicleEntry) ?? null;
}

export async function saveMeta(issueId: string, patch: Partial<Omit<ChronicleMeta, 'issueId' | 'sk'>>): Promise<ChronicleMeta> {
  const { meta } = await getIssue(issueId);
  const next: ChronicleMeta = { ...meta, ...patch, issueId, sk: META };
  await docClient.send(new PutCommand({ TableName: CHRONICLE_TABLE, Item: next }));
  return next;
}

/** Issues that have a finalized PDF, newest first (for the public "past issues" list). */
export async function listPublishedIssues(): Promise<ChronicleMeta[]> {
  const items: ChronicleMeta[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: ScanCommandOutput = await docClient.send(
      new ScanCommand({
        TableName: CHRONICLE_TABLE,
        FilterExpression: 'sk = :m AND attribute_exists(pdfKey)',
        ExpressionAttributeValues: { ':m': META },
        ExclusiveStartKey,
      })
    );
    items.push(...((out.Items as ChronicleMeta[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort((a, b) => b.issueId.localeCompare(a.issueId));
}
