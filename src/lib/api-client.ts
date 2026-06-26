// Tiny fetcher used by client components. Adds JSON headers + throws on
// non-2xx so callers can use try/catch. Never used for streaming.

export async function api<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request to ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}
