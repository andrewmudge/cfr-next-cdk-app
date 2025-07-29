import type { NextApiRequest, NextApiResponse } from 'next';
import { setAuthCookies } from './setAuthCookies';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { idToken, accessToken } = req.body;
  if (!idToken || !accessToken) return res.status(400).json({ error: 'Missing tokens' });
  setAuthCookies(res, idToken, accessToken);
  res.status(200).json({ success: true });
}
