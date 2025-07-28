import { NextRequest, NextResponse } from 'next/server';

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
    // Call Lambda function
    const lambdaUrl = process.env.NEXT_PUBLIC_UPLOAD_PHOTOS_LAMBDA_URL || process.env.UPLOAD_PHOTOS_LAMBDA_URL;
    if (!lambdaUrl) {
      return NextResponse.json({ error: 'Upload Lambda URL not configured' }, { status: 500 });
    }
    const lambdaResponse = await fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: buffer.toString('base64'),
        filename: (file as File).name,
        year
      }),
    });
    const result = await lambdaResponse.json();
    if (!lambdaResponse.ok) {
      return NextResponse.json({ error: result.error || 'Upload failed' }, { status: lambdaResponse.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}