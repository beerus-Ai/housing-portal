/** Error carrying the server's `{ error }` message and HTTP status. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type Params = Record<string, string | number | undefined | null>;

export const qs = (p?: Params): string => {
  const e = Object.entries(p ?? {}).filter(([, v]) => v !== '' && v != null) as [string, string | number][];
  return e.length ? '?' + new URLSearchParams(e.map(([k, v]) => [k, String(v)])).toString() : '';
};

export const enc = (x: string | number): string => encodeURIComponent(String(x));

export async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error || 'Request failed', res.status);
  return data as T;
}
