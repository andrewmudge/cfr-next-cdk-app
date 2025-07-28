import type { NextApiRequest, NextApiResponse } from 'next';
import { cognitoClient } from './utils';
import { ConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_CLIENT_ID } from './config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, code } = req.body;
  try {
    const command = new ConfirmSignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      ConfirmationCode: code
    });
    await cognitoClient.send(command);
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Confirmation failed';
    res.status(400).json({ error: errMsg });
  }
}
