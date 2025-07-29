import type { NextApiRequest, NextApiResponse } from 'next';
import { setAuthCookies } from './setAuthCookies';
import { cognitoClient } from './utils';
import { ListUsersCommand, ListUsersCommandOutput, UserType } from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_USER_POOL_ID } from './config';
import jwt from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { idToken, accessToken } = req.body;
  if (!idToken || !accessToken) return res.status(400).json({ error: 'Missing tokens' });
  // Decode idToken to get email
  let decoded: unknown = {};
  try {
    decoded = jwt.decode(idToken);
  } catch {
    return res.status(400).json({ error: 'Invalid token' });
  }
  // Type guard for decoded token
  const email = typeof decoded === 'object' && decoded && 'email' in decoded ? (decoded as { email?: string }).email : undefined;
  if (!email) return res.status(400).json({ error: 'No email in token' });
  // Check for existing native user with this email
  try {
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Filter: `email = \"${email}\"`
    });
    const listUsersResponse: ListUsersCommandOutput = await cognitoClient.send(listUsersCommand);
    const nativeUser = listUsersResponse.Users?.find((user: UserType) =>
      user.UserStatus !== 'EXTERNAL_PROVIDER' && !(user.Username && user.Username.startsWith('Google_'))
    );
    if (nativeUser) {
      return res.status(400).json({ error: 'This email is already registered with email/password. Please use email/password to sign in.' });
    }
  } catch {
    // If error, allow sign-in (fail open)
  }
  setAuthCookies(res, idToken, accessToken);
  res.status(200).json({ success: true });
}
