// The site's admins. Used by the server checks (lib/admin-auth.ts) and by the pages
// (what to show). To add or remove an admin, edit this list.
export const ADMIN_EMAILS = ['mudge.andrew@gmail.com', 'angelajachetti@gmail.com'];

export const isAdminEmail = (email?: string | null) => !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
