import type { NextApiRequest, NextApiResponse } from 'next';
import { cognitoClient } from './utils';
import { SignUpCommand, ListUsersCommand, ListUsersCommandOutput, UserType } from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID } from './config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password, firstName, lastName, phone } = req.body;
  try {
    // Check for existing federated user with this email
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Filter: `email = \"${email}\"`
    });
    const listUsersResponse: ListUsersCommandOutput = await cognitoClient.send(listUsersCommand);
    const federatedUser = listUsersResponse.Users?.find((user: UserType) =>
      user.UserStatus === 'EXTERNAL_PROVIDER' || (user.Username && user.Username.startsWith('Google_'))
    );
    if (federatedUser) {
      return res.status(400).json({ error: 'This email is already registered with Google. Please use Google sign-in.' });
    }
    // Proceed with signup
    const command = new SignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'phone_number', Value: phone },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName }
      ]
    });
    await cognitoClient.send(command);
    res.status(200).json({ nextStep: 'CONFIRM_SIGN_UP' });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Sign up failed';
    res.status(400).json({ error: errMsg });
  }
}
