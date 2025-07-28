import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { idToken } = req.cookies;
  if (!idToken) return res.status(401).json({ user: null });
  try {
    // Decode JWT to get user info (do not verify signature here)
    const decoded = jwt.decode(idToken) as {
      email?: string;
      'cognito:username'?: string;
      sub?: string;
      given_name?: string;
      family_name?: string;
      phone_number?: string;
    } | null;
    if (!decoded) return res.status(401).json({ user: null });
    res.status(200).json({ user: {
      email: decoded.email,
      username: decoded.given_name || decoded['cognito:username'] || decoded.email,
      id: decoded.sub,
      attributes: {
        given_name: decoded.given_name,
        family_name: decoded.family_name,
        phone_number: decoded.phone_number
      }
    }});
  } catch {
    res.status(401).json({ user: null });
  }
}
