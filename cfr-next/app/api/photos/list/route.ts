import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');

    if (!year) {
      console.error('Year parameter missing in request');
      return NextResponse.json({ error: 'Year parameter required' }, { status: 400 });
    }

    // Call Lambda function
    const lambdaUrl = `${process.env.LIST_LAMBDA_URL}?year=${year}`;
    console.log('Fetching photos from Lambda URL:', lambdaUrl);
    let lambdaResponse;
    try {
      lambdaResponse = await fetch(lambdaUrl);
    } catch (fetchErr) {
      console.error('Error fetching from Lambda:', fetchErr);
      return NextResponse.json({ error: 'Failed to fetch from Lambda', details: String(fetchErr) }, { status: 502 });
    }

    if (!lambdaResponse.ok) {
      const text = await lambdaResponse.text();
      console.error('Lambda response not OK:', lambdaResponse.status, text);
      return NextResponse.json({ error: 'Lambda response not OK', status: lambdaResponse.status, details: text }, { status: 502 });
    }

    let photos;
    try {
      photos = await lambdaResponse.json();
    } catch (jsonErr) {
      console.error('Error parsing Lambda response JSON:', jsonErr);
      return NextResponse.json({ error: 'Failed to parse Lambda response', details: String(jsonErr) }, { status: 502 });
    }

    console.log('Photos retrieved:', photos);
    return NextResponse.json(photos);
  } catch (err) {
    console.error('Unexpected error in /api/photos/list:', err);
    return NextResponse.json({ error: 'Failed to fetch photos', details: String(err) }, { status: 500 });
  }
}