import { NextRequest, NextResponse } from 'next/server';
import { invokeLambda, SITE_LAMBDAS } from '@/lib/lambda-invoke';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');

    if (!year) {
      console.error('Year parameter missing in request');
      return NextResponse.json({ error: 'Year parameter required' }, { status: 400 });
    }

    // Call the list-photos Lambda directly (it has no public URL).
    let result;
    try {
      result = await invokeLambda(SITE_LAMBDAS.listPhotos, { method: 'GET', query: { year } });
    } catch (invokeErr) {
      console.error('Error invoking list-photos Lambda:', invokeErr);
      return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 502 });
    }
    if (!result.ok) {
      console.error('list-photos Lambda returned', result.status, result.data);
      return NextResponse.json({ error: 'Failed to fetch photos', status: result.status }, { status: 502 });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    console.error('Unexpected error in /api/photos/list:', err);
    return NextResponse.json({ error: 'Failed to fetch photos', details: String(err) }, { status: 500 });
  }
}