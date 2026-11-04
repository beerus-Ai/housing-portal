import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import type { Me, Settings } from '../api';

export type Handler = (body: unknown, url: string) => { status?: number; json: unknown };
export interface Call { method: string; url: string; body: unknown }

/** Stub global fetch with a route table keyed "METHOD /path" (query string ignored). Records every call. */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const h = routes[`${method} ${url.split('?')[0]}`];
    if (h === undefined) return new Response(JSON.stringify({ error: `no mock for ${method} ${url}` }), { status: 404 });
    const r = typeof h === 'function' ? (h as Handler)(body, url) : { json: h };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export const signedOut = () => ({ status: 401, json: { error: 'Sign in required' } });

export const settings: Settings = {
  society_name: 'Test Heights', society_kind: 'Housing society', google_client_id: '',
  features: { emergency: true, gate: true, contacts: true, notices: true },
};

export const resident = (over: Partial<Me> = {}): Me => ({
  id: 2, name: 'Asha Rao', email: 'asha@example.test', phone: '', flat: 'A-101', resident_type: 'owner', role: 'resident', status: 'approved',
  permissions: ['request.create', 'emergency.raise', 'gate.pass', 'household.manage', 'notice.read', 'contacts.read', 'lease.view'],
  features: { emergency: true, gate: true, contacts: true, notices: true }, ...over,
});

export function renderApp(ui: ReactElement, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
