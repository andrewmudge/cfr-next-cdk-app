import { cookies } from 'next/headers';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { COGNITO_USER_POOL_ID } from '@/lib/cognito-config';
import { NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/admin-emails';

// Who is an admin lives in lib/admin-emails.ts (one list for the server and the pages).

const verifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: 'id',
  clientId: null, // accept both the email/password and Google app clients of this pool
});

/** Verifies the idToken cookie's signature and returns the admin email, or null. */
export async function getVerifiedAdmin(): Promise<string | null> {
  const token = (await cookies()).get('idToken')?.value;
  if (!token) return null;
  try {
    const payload = await verifier.verify(token);
    const email = String(payload.email || '').toLowerCase();
    return isAdminEmail(email) ? email : null;
  } catch {
    return null;
  }
}

/** For older API routes: returns a 401 response unless the caller is a verified admin. */
export async function requireAdmin(): Promise<NextResponse | null> {
  return (await getVerifiedAdmin()) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
