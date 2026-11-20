import { randomUUID } from 'crypto';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutCommand, ScanCommand, UpdateCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@/lib/reunion-db';

// Emails are built and sent by the send-broadcast Lambda (lambda-functions/send-broadcast.js).
// This module only records the job and hands it off, so a long send never runs inside a
// Vercel function (time limits) and attachments never pass through one (4.5MB body limit).

export const BROADCASTS_TABLE = process.env.BROADCASTS_TABLE || 'Broadcasts';
const FUNCTION_NAME = process.env.BROADCAST_FUNCTION_NAME || '';
const ATTACHMENTS_BUCKET = process.env.ATTACHMENTS_BUCKET || '';

const lambda = new LambdaClient({ region: 'us-east-1' });
const s3 = new S3Client({ region: 'us-east-1' });

export type Audience =
  | { type: 'everyone' }
  | { type: 'thisYear'; year: string }
  | { type: 'list'; emails: string[] }
  | { type: 'test' };

export interface Attachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export type BroadcastStatus = 'queued' | 'sending' | 'sent' | 'partial' | 'failed' | 'skipped';

export interface BroadcastRecord {
  broadcastId: string;
  kind: 'email' | 'signup';
  status: BroadcastStatus;
  createdAt: string;
  createdBy?: string;
  // kind = 'email'
  subject?: string;
  body?: string;
  attachments?: Attachment[];
  audience?: Audience;
  // kind = 'signup'
  year?: string;
  submissionId?: string;
  submitterName?: string;
  reunionLabel?: string;
  // progress (written by the Lambda)
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  failures?: { email: string; error: string }[];
  startedAt?: string;
  finishedAt?: string;
}

// An old 'settings' row (from the removed sign-up announcement toggle) may exist; never list it.
const SETTINGS_ID = 'settings';

export const emailConfigured = () => !!FUNCTION_NAME;

type NewBroadcast = Omit<BroadcastRecord, 'broadcastId' | 'status' | 'createdAt'>;

/** Record a send job and start the Lambda on it (async; returns right away). */
export async function queueBroadcast(job: NewBroadcast): Promise<BroadcastRecord> {
  if (!FUNCTION_NAME) throw new Error('Email sending is not configured (BROADCAST_FUNCTION_NAME is not set).');
  const record: BroadcastRecord = {
    ...job,
    broadcastId: `${new Date().toISOString().slice(0, 10)}_${randomUUID()}`,
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: BROADCASTS_TABLE, Item: record }));
  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ broadcastId: record.broadcastId })),
      })
    );
  } catch (err) {
    await docClient.send(
      new UpdateCommand({
        TableName: BROADCASTS_TABLE,
        Key: { broadcastId: record.broadcastId },
        UpdateExpression: 'SET #s = :f, failures = :fl',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':f': 'failed', ':fl': [{ email: '', error: `Could not start send: ${String(err)}` }] },
      })
    );
    throw err;
  }
  return record;
}

export async function listBroadcasts(limit = 50): Promise<BroadcastRecord[]> {
  const items: BroadcastRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: ScanCommandOutput = await docClient.send(new ScanCommand({ TableName: BROADCASTS_TABLE, ExclusiveStartKey }));
    items.push(...((out.Items as BroadcastRecord[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items
    .filter((b) => b.broadcastId !== SETTINGS_ID)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ---------- Attachments ----------

export const ATTACHMENT_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};
/** SES caps a whole message at 40MB, and base64 adds ~37%. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

const safeName = (name: string) =>
  name
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'attachment';

/** Presigned PUT URLs so the browser uploads attachments straight to S3. */
export async function presignAttachmentUploads(
  files: { name: string; type: string; size: number }[]
): Promise<{ attachment: Attachment; uploadUrl: string }[]> {
  if (!ATTACHMENTS_BUCKET) throw new Error('ATTACHMENTS_BUCKET is not set.');
  const folder = randomUUID();
  return Promise.all(
    files.map(async (f) => {
      const filename = safeName(f.name);
      const key = `email-attachments/${folder}/${filename}`;
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: ATTACHMENTS_BUCKET, Key: key, ContentType: f.type }),
        { expiresIn: 15 * 60 }
      );
      return { attachment: { key, filename, contentType: f.type, size: f.size }, uploadUrl };
    })
  );
}
