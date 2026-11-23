import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadTournament } from '@/lib/tournament/store';
import {
  MANAGER_COOKIE_MAX_AGE,
  managerCookieName,
  managerCookieValue,
  managerLoginAvailable,
  verifyPassword,
} from '@/lib/tournament/auth';
import { badRequest, errorResponse, noStore, parseGame, parseYear } from '@/lib/tournament/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ game: string }> };

// Slow down password guessing: per-IP failures in this server instance.
const failures = new Map<string, { n: number; at: number }>();
const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

/** "Manage" button: check the tournament's manager password and remember this phone. */
export async function POST(req: NextRequest, { params }: Params) {
  const game = parseGame((await params).game);
  if (!game) return badRequest('Unknown tournament.');
  const parsed = z.object({ year: z.string(), password: z.string().min(1).max(100) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Enter the manager password.');
  const year = parseYear(parsed.data.year);
  if (!year) return badRequest('Invalid year.');
  if (!managerLoginAvailable()) {
    return NextResponse.json({ error: 'Manager sign-in is not configured on the server.' }, { status: 503, headers: noStore });
  }

  const ip = ipOf(req);
  const f = failures.get(ip);
  if (f && f.n >= 5 && Date.now() - f.at < 60_000) {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429, headers: noStore });
  }

  try {
    const s = await loadTournament(year, game);
    if (!s?.managerPasswordHash) return NextResponse.json({ error: 'No manager password has been set yet.' }, { status: 400, headers: noStore });
    if (!verifyPassword(parsed.data.password, s.managerPasswordHash)) {
      failures.set(ip, { n: (f && Date.now() - f.at < 60_000 ? f.n : 0) + 1, at: Date.now() });
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: 'That password is not right.' }, { status: 401, headers: noStore });
    }
    failures.delete(ip);
    const res = NextResponse.json({ ok: true }, { headers: noStore });
    res.cookies.set(managerCookieName(year, game), managerCookieValue(s), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MANAGER_COOKIE_MAX_AGE,
    });
    return res;
  } catch (err) {
    return errorResponse(err, 'POST /api/tournaments/[game]/manage');
  }
}

/** Stop managing on this phone. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const game = parseGame((await params).game);
  const year = parseYear(req.nextUrl.searchParams.get('year'));
  if (!game || !year) return badRequest('Unknown tournament.');
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(managerCookieName(year, game), '', { path: '/', maxAge: 0 });
  return res;
}
