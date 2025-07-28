import type { NextApiRequest, NextApiResponse } from 'next';
import { cognitoClient } from './utils';
import { SignUpCommand } from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_CLIENT_ID } from './config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password, firstName, lastName, phone } = req.body;
  try {
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
