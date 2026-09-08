// Client-only: downscale large photos before upload so they stay under
// Vercel's ~4.5MB serverless function request body limit.

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB, with margin under Vercel's 4.5MB cap
const MAX_DIMENSION = 2400; // longest edge, px
const MIN_QUALITY = 0.5;

export async function compressImageIfNeeded(file: File): Promise<File> {
  // Animated GIFs would lose their animation if redrawn to canvas; leave them alone.
  if (file.type === 'image/gif' || file.size <= MAX_UPLOAD_BYTES) {
    return file;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > MAX_UPLOAD_BYTES && quality > MIN_QUALITY) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }

  if (!blob) return file;

  const compressedName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
  return new File([blob], compressedName, { type: 'image/jpeg' });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
