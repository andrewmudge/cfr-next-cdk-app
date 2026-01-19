import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_REGION } from '@/lib/cognito-config';

export const cognitoClient = new CognitoIdentityProviderClient({ region: COGNITO_REGION });
