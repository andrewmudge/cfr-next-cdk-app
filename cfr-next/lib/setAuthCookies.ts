import type { NextApiResponse } from 'next';
import { serialize } from 'cookie';

export function setAuthCookies(res: NextApiResponse, idToken: string, accessToken: string) {
  res.setHeader('Set-Cookie', [
    serialize('idToken', idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 // 1 day
    }),
    serialize('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24
    })
  ]);
}
