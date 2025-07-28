import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { keys } = await request.json();
    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'No photo keys provided' }, { status: 400 });
    }
    // Call Lambda to delete photos
    const lambdaUrl = process.env.NEXT_PUBLIC_DELETE_PHOTOS_LAMBDA_URL || process.env.DELETE_PHOTOS_LAMBDA_URL;
    if (!lambdaUrl) {
      return NextResponse.json({ error: 'Delete Lambda URL not configured' }, { status: 500 });
    }
    const res = await fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys })
    });
    const result = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: result.error || 'Delete failed' }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
