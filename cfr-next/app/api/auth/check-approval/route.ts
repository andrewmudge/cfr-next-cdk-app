import { NextRequest, NextResponse } from 'next/server';
// Make sure checkUserApproval is exported from the module
import { checkUserApprovalServer } from '@/lib/dynamodb-server';
// If not, import the correct function or fix the export in '@/lib/dynamodb-server'

// POST is not required, GET is fine for this check

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ approved: false, error: 'Missing email' }, { status: 400 });
  }
  try {
    const approved = await checkUserApprovalServer(email);
    return NextResponse.json({ approved });
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ approved: false, error: message }, { status: 500 });
  }
}
