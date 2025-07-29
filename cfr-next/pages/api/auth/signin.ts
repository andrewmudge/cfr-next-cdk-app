import type { NextApiRequest, NextApiResponse } from 'next';
import { cognitoClient } from './utils';
import { AdminInitiateAuthCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } from './config';
import { setAuthCookies } from './setAuthCookies';
import { checkUserApprovalServer } from '@/lib/dynamodb-server';
import { jwtDecode } from 'jwt-decode';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password } = req.body;
  try {
    // Check if a federated user exists for this email
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Filter: `email = \"${email}\"`,
      Limit: 1,
    });
    const usersResult = await cognitoClient.send(listUsersCommand);
    const user = usersResult.Users && usersResult.Users[0];
    if (user) {
      // If the user has a federated identity provider, block native sign-in
      const hasFederated = user.Attributes?.some(
        (attr) => attr.Name === 'identities' && attr.Value && attr.Value !== ''
      );
      if (hasFederated) {
        return res.status(403).json({ error: 'This email is registered with Google. Please sign in with Google.' });
      }
    }

    const command = new AdminInitiateAuthCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      ClientId: COGNITO_CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });
    const response = await cognitoClient.send(command);
    const idToken = response.AuthenticationResult?.IdToken;
    const accessToken = response.AuthenticationResult?.AccessToken;
    if (!idToken || !accessToken) throw new Error('Authentication failed');
    // Set HttpOnly cookies
    setAuthCookies(res, idToken, accessToken);
    // Check approval in DynamoDB
    const isApproved = await checkUserApprovalServer(email);
    if (!isApproved) {
      return res.status(403).json({ error: 'ACCOUNT_PENDING_APPROVAL' });
    }
    // Decode idToken to get user attributes
    interface DecodedIdToken {
      given_name?: string;
      [key: string]: string | undefined;
    }
    let attributes: DecodedIdToken = {};
    try {
      attributes = jwtDecode<DecodedIdToken>(idToken);
    } catch (e) {
      console.warn('Could not decode idToken:', e);
    }
    // Return user info with username set to given_name, preferred_username, or email
    const username = attributes.given_name || attributes.preferred_username || email;
    res.status(200).json({ user: { email, username, attributes } });
  } catch (error: unknown) {
    console.error('Sign in error:', error);
    const errMsg = error instanceof Error ? error.message : 'Sign in failed';
    res.status(400).json({ error: errMsg });
  }
}
