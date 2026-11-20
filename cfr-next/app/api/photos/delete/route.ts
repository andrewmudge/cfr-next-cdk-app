import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { invokeLambda, SITE_LAMBDAS } from '@/lib/lambda-invoke';

export async function POST(request: NextRequest) {
  // Admin only (see lib/admin-emails.ts).
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { keys } = await request.json();
    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'No photo keys provided' }, { status: 400 });
    }
    // Call the delete Lambda directly (it has no public URL).
    const res = await invokeLambda(SITE_LAMBDAS.deletePhotos, { method: 'POST', body: { keys } });
    const result = (res.data ?? {}) as { error?: string };
    if (!res.ok) {
      return NextResponse.json({ error: result.error || 'Delete failed' }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
