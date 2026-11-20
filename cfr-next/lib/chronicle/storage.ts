import { randomUUID } from 'crypto';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Photos live privately under chronicle/<issueId>/; finalized PDFs are public-read
// under public/chronicle/ (see the bucket policy in cdk/lib/cdk-stack.ts).
const BUCKET = process.env.CHRONICLE_BUCKET || process.env.ATTACHMENTS_BUCKET || '';
const s3 = new S3Client({ region: 'us-east-1' });

/** The browser re-encodes every photo to a ~1600px JPEG first, so this is generous. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const storageConfigured = () => !!BUCKET;
export const photoPrefix = (issueId: string) => `chronicle/${issueId}/`;
export const pdfKeyFor = (issueId: string) => `public/chronicle/${issueId}.pdf`;
export const publicUrl = (key: string) => `https://${BUCKET}.s3.amazonaws.com/${key}`;

function requireBucket() {
  if (!BUCKET) throw new Error('CHRONICLE_BUCKET / ATTACHMENTS_BUCKET is not set.');
}

/** Presigned POSTs: S3 itself rejects anything over the size cap or that isn't a JPEG. */
export async function presignPhotoUploads(issueId: string, count: number) {
  requireBucket();
  return Promise.all(
    Array.from({ length: count }, async () => {
      const key = `${photoPrefix(issueId)}${randomUUID()}.jpg`;
      const { url, fields } = await createPresignedPost(s3, {
        Bucket: BUCKET,
        Key: key,
        Conditions: [
          ['content-length-range', 1, MAX_PHOTO_BYTES],
          ['eq', '$Content-Type', 'image/jpeg'],
        ],
        Fields: { 'Content-Type': 'image/jpeg' },
        Expires: 30 * 60,
      });
      return { key, url, fields };
    })
  );
}

export async function photoExists(key: string): Promise<boolean> {
  requireBucket();
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return (head.ContentLength ?? 0) > 0 && (head.ContentLength ?? 0) <= MAX_PHOTO_BYTES;
  } catch {
    return false;
  }
}

export async function getPhotoBuffer(key: string): Promise<Buffer> {
  requireBucket();
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await out.Body!.transformToByteArray());
}

/** Short-lived link so the admin review screen can show private photos. */
export async function signedPhotoUrl(key: string): Promise<string> {
  requireBucket();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 60 * 60 });
}

export async function deletePhotos(keys: string[]) {
  if (!keys.length) return;
  requireBucket();
  await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
}

export async function savePdf(issueId: string, pdf: Buffer): Promise<string> {
  requireBucket();
  const key = pdfKeyFor(issueId);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: pdf,
      ContentType: 'application/pdf',
      ContentDisposition: `inline; filename="Churchwell-Chronicle-${issueId}.pdf"`,
      // Re-finalizing overwrites the same key, so don't let browsers hold an old copy.
      CacheControl: 'no-cache',
    })
  );
  return key;
}
