import { NextRequest, NextResponse } from 'next/server';
import { unsubscribeByToken } from '@/lib/messaging/mailing-list';

export const dynamic = 'force-dynamic';

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f4f1ea;color:#222}
main{max-width:480px;margin:48px auto;padding:28px;background:#fff;border-radius:8px;text-align:center}
button{font-size:16px;padding:10px 20px;border:0;border-radius:6px;background:#1e293b;color:#fff;cursor:pointer}
a{color:#1e293b}</style></head>
<body><main><h1 style="font-size:22px">${title}</h1>${body}</main></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );

const token = (req: NextRequest) => (req.nextUrl.searchParams.get('t') || '').trim();

// GET only shows a button: mail scanners follow links, so a GET must never unsubscribe anyone.
export async function GET(req: NextRequest) {
  const t = token(req);
  if (!t) return page('Unsubscribe', '<p>This unsubscribe link is missing its code.</p>');
  return page(
    'Unsubscribe from reunion emails?',
    `<p>You'll stop getting Churchwell Family Reunion emails. Sign-up confirmations still come through.</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`
  );
}

// POST handles both the button above and Gmail/Yahoo one-click (List-Unsubscribe-Post).
export async function POST(req: NextRequest) {
  const t = token(req);
  try {
    const email = t ? await unsubscribeByToken(t) : null;
    if (!email) return page('Link not recognized', '<p>We couldn’t find that address. It may already be removed.</p>');
    return page(
      'You’re unsubscribed',
      '<p>You won’t get reunion emails anymore. Changed your mind? Just reply to any reunion email and we’ll add you back.</p><p><a href="/">Back to churchwellreunion.com</a></p>'
    );
  } catch (err) {
    console.error('POST /api/unsubscribe failed', err);
    return page('Something went wrong', '<p>Please try again in a minute.</p>');
  }
}
