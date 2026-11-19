import { cookies } from 'next/headers';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { COGNITO_USER_POOL_ID } from '@/lib/cognito-config';

// Comma-separated list; falls back to the admin already hardcoded in app/admin/page.tsx.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'mudge.andrew@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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
    return ADMIN_EMAILS.includes(email) ? email : null;
  } catch {
    return null;
  }
}
