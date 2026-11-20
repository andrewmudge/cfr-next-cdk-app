import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/admin-auth';
import { emailsFromCsv, listMembers, normalizeEmail, upsertMembers } from '@/lib/messaging/mailing-list';

export const dynamic = 'force-dynamic';

const MAX_CSV_CHARS = 2_000_000;

/** Import a Google Groups member export (or any CSV with an email column). dryRun = preview only. */
export async function POST(req: NextRequest) {
  if (!(await getVerifiedAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const csv = String(body.csv || '');
  if (!csv.trim()) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });
  if (csv.length > MAX_CSV_CHARS) return NextResponse.json({ error: 'That file is too big.' }, { status: 400 });

  // 'archive' = keep these on file but never email them.
  const target: 'subscribed' | 'archived' = body.list === 'archive' ? 'archived' : 'subscribed';
  const { entries, invalid } = emailsFromCsv(csv);
  const unique = new Map(entries.map((e) => [normalizeEmail(e.email), e]));
  if (!unique.size) return NextResponse.json({ error: 'No email addresses found in that file.' }, { status: 400 });

  try {
    if (body.dryRun) {
      const existing = new Map((await listMembers()).map((m) => [m.email, m.status]));
      const newOnes = [...unique.keys()].filter((e) => !existing.has(e));
      return NextResponse.json({
        found: unique.size,
        new: newOnes.length,
        alreadyOnList: unique.size - newOnes.length,
        // Existing rows keep their status, so e.g. active people in an archive file stay active.
        alreadyActive: [...unique.keys()].filter((e) => existing.get(e) === 'subscribed').length,
        alreadyArchived: [...unique.keys()].filter((e) => existing.get(e) === 'archived').length,
        invalid,
        sample: newOnes.slice(0, 10),
      });
    }
    const result = await upsertMembers([...unique.values()], 'import', target);
    return NextResponse.json({ ok: true, ...result, invalid });
  } catch (err) {
    console.error('POST /api/admin/mailing-list/import failed', err);
    return NextResponse.json({ error: 'Import failed.' }, { status: 500 });
  }
}
