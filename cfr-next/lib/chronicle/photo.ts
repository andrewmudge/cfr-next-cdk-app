// Client-only: turn any phone photo (HEIC, huge JPEG, PNG screenshot…) into a modest JPEG
// before it's uploaded. Keeps uploads fast on cell data and the compiled PDF a sane size.

const MAX_DIMENSION = 1600; // longest edge, px — plenty for a printed half-page photo
const QUALITY = 0.82;

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  // JPEG has no transparency: put PNG screenshots etc. on white, not black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Could not encode photo');
  return { blob, width, height };
}

/** Upload to S3 with a presigned POST, reporting progress (0–1). */
export function uploadWithPresignedPost(
  target: { url: string; fields: Record<string, string> },
  blob: Blob,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(target.fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', blob, 'photo.jpg'); // must be the last field
    const xhr = new XMLHttpRequest();
    xhr.open('POST', target.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
