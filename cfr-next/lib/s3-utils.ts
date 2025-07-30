// S3 utility functions for photo gallery

// Server-only imports
import { S3Client, ListObjectsV2Command, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || process.env.AMPLIFY_STORAGE_BUCKET_NAME || '';

// Only instantiate S3 client on server
const s3 = typeof window === 'undefined' ? new S3Client({ region: REGION }) : undefined;
export interface PhotoMetadata {
  id: string;
  url: string;
  caption: string;
  uploader: string;
  date: string;
  year: number;
}

/**
 * Server-only: List photos from S3
 */
export async function listPhotos(year: number): Promise<PhotoMetadata[]> {
  if (!BUCKET_NAME) throw new Error('S3 bucket name not set');
  if (!s3) throw new Error('S3 client not available on client side');
  const Prefix = `public/photos/${year}/`;
  const listParams = { Bucket: BUCKET_NAME, Prefix };
  const data = await s3.send(new ListObjectsV2Command(listParams));
  if (!data.Contents) return [];
  type S3Object = { Key?: string };
  const photos = await Promise.all(
    data.Contents.filter((obj: S3Object) => obj.Key && !obj.Key.endsWith('/')).map(async (object: S3Object) => {
      const headParams = { Bucket: BUCKET_NAME, Key: object.Key! };
      const metadata = await s3.send(new HeadObjectCommand(headParams));
      const photoId = object.Key!.split('/').pop()!.split('.')[0];
      return {
        id: photoId,
        url: `https://d3h0xsdn3j96uc.cloudfront.net/${object.Key}`,
        caption: metadata.Metadata?.caption || '',
        uploader: metadata.Metadata?.uploader || '',
        date: metadata.Metadata?.date || '',
        year: parseInt(metadata.Metadata?.year || year.toString())
      };
    })
  );
  return photos;
}

/**
 * Server-only: Upload photo to S3
 */
export async function uploadPhoto(file: File, year: number, metadata: { caption: string; uploader: string; date: string; }) {
  if (!BUCKET_NAME) throw new Error('S3 bucket name not set');
  if (!s3) throw new Error('S3 client not available on client side');
  const fileExtension = file.name.split('.').pop();
  const photoId = uuidv4();
  const s3Key = `public/photos/${year}/${photoId}.${fileExtension}`;
  const arrayBuffer = await file.arrayBuffer();
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: Buffer.from(arrayBuffer),
    ContentType: file.type,
    Metadata: {
      caption: metadata.caption,
      uploader: metadata.uploader,
      date: metadata.date,
      year: year.toString(),
      originalName: file.name
    }
  };
  await s3.send(new PutObjectCommand(uploadParams));
  return {
    id: photoId,
    url: `https://d3h0xsdn3j96uc.cloudfront.net/${s3Key}`,
    caption: metadata.caption,
    uploader: metadata.uploader,
    date: metadata.date,
    year
  };
}

// Client-safe: fetch photos via API route
export const fetchPhotos = async (year: string): Promise<PhotoMetadata[]> => {
  const response = await fetch(`/api/photos/list?year=${year}`);
  if (!response.ok) {
    throw new Error('Failed to fetch photos');
  }
  return response.json();
};
