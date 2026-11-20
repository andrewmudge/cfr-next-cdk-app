import { NextRequest, NextResponse } from 'next/server';
import { invokeLambda, SITE_LAMBDAS } from '@/lib/lambda-invoke';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const year = formData.get('year');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    // Call the upload Lambda directly (it has no public URL).
    const res = await invokeLambda(SITE_LAMBDAS.uploadPhotos, {
      method: 'POST',
      body: { file: buffer.toString('base64'), filename: (file as File).name, year },
    });
    const result = (res.data ?? {}) as { error?: string };
    if (!res.ok) {
      return NextResponse.json({ error: result.error || 'Upload failed' }, { status: res.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}