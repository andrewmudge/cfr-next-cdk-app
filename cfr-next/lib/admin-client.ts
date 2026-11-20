// Client-side admin check (for showing admin controls only). The server re-checks every
// admin request with a verified Cognito token in lib/admin-auth.ts.
export { ADMIN_EMAILS, isAdminEmail } from './admin-emails';
