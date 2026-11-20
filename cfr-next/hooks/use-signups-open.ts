'use client';

import { useEffect, useState } from 'react';

// One fetch shared by every component on the page (header, footer, sign-up form, ...).
let pending: Promise<boolean> | null = null;
const load = () =>
  (pending ??= fetch('/api/site-settings', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { signupsOpen: true }))
    .then((d) => d.signupsOpen !== false)
    // If the check itself fails, show sign-up: the server still refuses sign-ups when they're closed.
    .catch(() => true));

/** Whether public sign-ups are open. null while loading (render nothing sign-up related yet). */
export function useSignupsOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setOpen(v));
    return () => {
      alive = false;
    };
  }, []);
  return open;
}

/** Call after the admin changes the setting so this tab's hook re-reads it. */
export const resetSignupsOpenCache = () => {
  pending = null;
};
