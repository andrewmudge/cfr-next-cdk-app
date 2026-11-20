'use client';

import { useEffect, useState } from 'react';

// Same pattern as use-signups-open: one shared fetch of /api/site-settings per page load.
let pending: Promise<boolean> | null = null;
const load = () =>
  (pending ??= fetch('/api/site-settings', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { chronicleOpen: false }))
    .then((d) => d.chronicleOpen !== false)
    // If the check fails, hide the Chronicle link: it's a nice-to-have on the home page.
    .catch(() => false));

/** Whether the Churchwell Chronicle is taking updates. null while loading (render nothing yet). */
export function useChronicleOpen(): boolean | null {
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
