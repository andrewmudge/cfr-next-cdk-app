// Client-side admin check (for showing edit controls only). The server re-checks every edit
// with a verified Cognito token in lib/admin-auth.ts.
export const ADMIN_EMAIL = 'mudge.andrew@gmail.com';
export const isAdminEmail = (email?: string | null) => !!email && email.toLowerCase() === ADMIN_EMAIL;
