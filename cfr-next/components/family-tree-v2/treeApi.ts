/** Calls an admin family-tree endpoint and throws a readable error on failure. */
export async function treeApi<T = unknown>(method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Please sign in as admin again.');
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data as T;
}
