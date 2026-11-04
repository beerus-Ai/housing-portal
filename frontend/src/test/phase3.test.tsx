import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../auth/guards';
import { Shell } from '../components/Shell';
import Emergency from '../pages/Emergency';
import Gate from '../pages/Gate';
import GatePass from '../pages/GatePass';
import Menu from '../pages/Menu';
import { activeTab, navSections, subPageInfo, tabsFor } from '../nav';
import { mockApi, renderApp, resident, settings } from './helpers';
import type { Me } from '../api';

const full = (over: Partial<Me> = {}) => resident({ permissions: [...resident().permissions, 'vehicle.manage', 'parking.view'], ...over });
const admin: Me = { ...resident(), role: 'admin', resident_type: null, flat: null, name: 'Society Admin' };
const guard: Me = { ...resident(), role: 'guard', resident_type: null, flat: null, name: 'Gita Guard' };
const titles = (me: Me) => navSections(me).sections.map((s) => s.title);
const itemsOf = (me: Me, title: string) => navSections(me).sections.find((s) => s.title === title)?.items.map((i) => i.label) ?? [];

function phone() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: true, media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined,
  }));
}

afterEach(() => { vi.useRealTimers(); });

describe('grouped navigation', () => {
  it('puts resident pages into the four sections and drops empty ones', () => {
    expect(titles(full())).toEqual(['Requests and safety', 'Community', 'Property']);
    expect(itemsOf(full(), 'Requests and safety')).toEqual(['Requests', 'Raise a request', 'Emergency']);
    expect(itemsOf(full(), 'Property')).toEqual(expect.arrayContaining(['Vehicles', 'Parking', 'Gate pass']));
    expect(itemsOf(full(), 'Community')).toEqual(expect.arrayContaining(['Notices', 'Contacts', 'Household']));
  });

  it('gives the committee an Administration section', () => {
    expect(titles(admin)).toEqual(['Requests and safety', 'Community', 'Property', 'Administration']);
    expect(itemsOf(admin, 'Administration')).toEqual(['Approvals', 'Workers', 'Vendors', 'Audit trail', 'Settings']);
    expect(itemsOf(admin, 'Requests and safety')).toContain('Gate');
  });

  it('filters sections by permissions and feature flags', () => {
    const off = resident({ permissions: ['request.create'], features: { emergency: false, gate: false, contacts: false, notices: false, parking: false } });
    expect(titles(off)).toEqual(['Requests and safety']);
    expect(itemsOf(off, 'Requests and safety')).toEqual(['Requests', 'Raise a request']);
    expect(itemsOf(resident({ permissions: ['parking.view'] }), 'Property')).toEqual(['Parking']);
  });

  it('collapses a section in the side layout and remembers it', async () => {
    mockApi({ 'GET /api/me': full(), 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 0 } });
    renderApp(<Routes><Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<p>CONTENT</p>} /></Route></Route></Routes>);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Vehicles')).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole('button', { name: /Property/ }));
    expect(within(nav).queryByText('Vehicles')).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /Property/ })).toHaveAttribute('aria-expanded', 'false');
    expect(JSON.parse(localStorage.getItem('hp.navgroups')!)).toEqual(['Property']);
  });

  it('shows dropdowns in the top layout', async () => {
    localStorage.setItem('hp.nav', JSON.stringify({ pos: 'top', hidden: false }));
    mockApi({ 'GET /api/me': full(), 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 0 } });
    renderApp(<Routes><Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<p>CONTENT</p>} /></Route></Route></Routes>);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Gate pass')).not.toBeInTheDocument();
    await userEvent.click(within(nav).getByRole('button', { name: /Property/ }));
    expect(within(nav).getByText('Gate pass')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(within(nav).queryByText('Gate pass')).not.toBeInTheDocument();
  });
});

describe('phone tabs', () => {
  it('uses the tab set of each role', () => {
    expect(tabsFor(resident()).map((t) => t.label)).toEqual(['Home', 'Requests', 'Emergency', 'Alerts', 'Menu']);
    expect(tabsFor(admin).map((t) => t.label)).toEqual(['Dashboard', 'Requests', 'Emergency', 'Approvals', 'Menu']);
    expect(tabsFor(guard).map((t) => t.label)).toEqual(['Gate', 'Log', 'Profile']);
    expect(tabsFor(resident({ features: { emergency: false } })).map((t) => t.label)).not.toContain('Emergency');
  });

  it('maps sub-pages to a parent tab and a back target', () => {
    const r = resident();
    expect(activeTab(r, '/')).toBe('home');
    expect(activeTab(r, '/raise')).toBe('requests');
    expect(activeTab(r, '/requests/4')).toBe('requests');
    expect(activeTab(r, '/gatepass')).toBe('menu');
    expect(activeTab(r, '/alerts')).toBe('alerts');
    expect(activeTab(admin, '/alerts')).toBe('menu');
    expect(activeTab(admin, '/emergencies')).toBe('emergency');
    expect(activeTab(admin, '/workers')).toBe('menu');
    expect(activeTab(guard, '/gatelog')).toBe('gatelog');
    expect(subPageInfo(r, '/gatepass')).toEqual({ title: 'Gate pass', back: '/menu' });
    expect(subPageInfo(r, '/raise')).toEqual({ title: 'Raise a request', back: '/requests' });
    expect(subPageInfo(r, '/requests')).toBeNull();
    expect(subPageInfo(r, '/menu')).toBeNull();
  });

  it('renders the bottom bar, a floating + for residents and no side menu', async () => {
    phone();
    mockApi({ 'GET /api/me': full(), 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 2 } });
    renderApp(<Routes><Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<p>CONTENT</p>} /></Route></Route></Routes>);
    const bar = await screen.findByRole('navigation', { name: 'Tabs' });
    expect(within(bar).getAllByRole('link').map((a) => a.textContent)).toEqual(['Home', 'Requests', 'Emergency', 'Alerts', 'Menu']);
    expect(within(bar).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Raise a request' })).toHaveAttribute('href', '/raise');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('shows a back arrow and title on a sub-page, and the grouped Menu screen', async () => {
    phone();
    mockApi({ 'GET /api/me': full(), 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 0 } });
    renderApp(
      <Routes><Route element={<RequireAuth />}><Route element={<Shell />}>
        <Route path="menu" element={<Menu />} /><Route path="vehicles" element={<p>VEHICLES PAGE</p>} />
      </Route></Route></Routes>, '/vehicles',
    );
    expect(await screen.findByText('VEHICLES PAGE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vehicles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/menu');
    expect(within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('link', { name: 'Menu' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));
    for (const s of ['Requests and safety', 'Community', 'Property', 'Account']) expect(await screen.findByRole('region', { name: s })).toBeInTheDocument();
  });

  it('shows the live red emergency count on the committee tab', async () => {
    phone();
    mockApi({
      'GET /api/me': admin, 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 0 }, 'GET /api/admin/users': [],
      'GET /api/emergencies': [{ id: 1, type: 'fire', note: null, status: 'active', flat: 'A-1', user_name: 'X', created_at: '2026-11-04 10:00:00', resolved_at: null }],
    });
    renderApp(<Routes><Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<p>CONTENT</p>} /></Route></Route></Routes>);
    expect(await screen.findByTestId('emg-count')).toHaveTextContent('1');
  });
});

describe('emergency badge', () => {
  it('is not shown to residents even when their own alert is active', async () => {
    phone();
    mockApi({
      'GET /api/me': full(), 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 0 },
      'GET /api/emergencies': [{ id: 1, type: 'fire', note: null, status: 'active', flat: 'A-101', user_name: 'Asha', created_at: '2026-11-04 10:00:00', resolved_at: null }],
    });
    renderApp(<Routes><Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<Emergency />} /></Route></Route></Routes>);
    expect(await screen.findByText('Recent alerts for your flat')).toBeInTheDocument();
    await screen.findByText('Active');
    expect(screen.queryByTestId('emg-count')).not.toBeInTheDocument();
  });
});

describe('emergency flow', () => {
  it('lets a resident pick a type, confirm in the sheet and sends the alert with a note', async () => {
    const { calls } = mockApi({
      'GET /api/me': resident(), 'GET /api/settings': settings, 'GET /api/emergencies': [],
      'POST /api/emergencies': { json: { id: 9 } },
    });
    renderApp(<Emergency />);
    const tiles = await screen.findAllByRole('button', { name: /Stuck in lift|Medical|Fire|Theft|Threat|Violence|Other/ });
    expect(tiles).toHaveLength(7);
    await userEvent.click(screen.getByRole('button', { name: 'Fire' }));
    const dlg = await screen.findByRole('dialog', { name: 'Confirm emergency alert' });
    expect(within(dlg).getByText('Send Fire alert?')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.type(within(dlg).getByLabelText('Note (optional)'), 'smoke in corridor');
    await userEvent.click(within(dlg).getByRole('button', { name: /Send alert/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ type: 'fire', note: 'smoke in corridor' });
    expect(screen.getByText(/Alert sent/)).toBeInTheDocument();
  });

  it('cancelling the sheet sends nothing', async () => {
    const { calls } = mockApi({ 'GET /api/me': resident(), 'GET /api/settings': settings, 'GET /api/emergencies': [] });
    renderApp(<Emergency />);
    await userEvent.click(await screen.findByRole('button', { name: 'Medical' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('emergencies'))).toBe(false);
  });

  it('shows the committee list with an active count and resolves an alert', async () => {
    const rows = [
      { id: 5, type: 'fire', note: 'smoke', status: 'active', flat: 'B-12', user_name: 'Ravi', created_at: '2026-11-04 10:00:00', resolved_at: null },
      { id: 4, type: 'medical', note: null, status: 'resolved', flat: 'A-3', user_name: 'Mira', created_at: '2026-11-03 10:00:00', resolved_at: '2026-11-03 10:20:00' },
    ];
    const { calls } = mockApi({
      'GET /api/me': admin, 'GET /api/settings': settings, 'GET /api/emergencies': rows, 'POST /api/emergencies/5/resolve': { json: { ok: true } },
    });
    renderApp(<Emergency />);
    expect(await screen.findByText('1 active')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Mark resolved/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /Mark resolved/ }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/emergencies/5/resolve')).toBe(true));
  });
});

describe('gate verify flow', () => {
  const guardApi = (verify: unknown) => mockApi({
    'GET /api/me': guard, 'GET /api/settings': settings, 'GET /api/gate/log': [],
    'POST /api/gate/verify': (b: unknown) => ({ json: typeof verify === 'function' ? (verify as (b: unknown) => unknown)(b) : verify }),
  });

  it('rejects anything but 6 digits without calling the server', async () => {
    const { calls } = guardApi({ result: 'allowed' });
    renderApp(<Gate />);
    await userEvent.type(await screen.findByLabelText('6-digit code'), '123');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(await screen.findByText('Enter the 6-digit code')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/gate/verify')).toBe(false);
  });

  it('shows ALLOWED with the visitor details, then clears the card after 8 seconds', async () => {
    const { calls } = guardApi({ result: 'allowed', kind: 'visitor', name: 'Dev Visitor', flat: 'A-101', purpose: 'Delivery' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(<Gate />);
    const input = await screen.findByLabelText('6-digit code');
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, '482913');
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: /Verify/ }));
    const card = await screen.findByTestId('gate-result');
    expect(card).toHaveTextContent('ALLOWED');
    expect(card).toHaveTextContent('Dev Visitor');
    expect(card).toHaveTextContent('Flat A-101');
    expect(calls.find((c) => c.url === '/api/gate/verify')?.body).toEqual({ code: '482913' });
    expect(input).toHaveValue('');
    act(() => { vi.advanceTimersByTime(7900); });
    expect(screen.getByTestId('gate-result')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByTestId('gate-result')).not.toBeInTheDocument();
  });

  it('shows DENIED with a plain-language reason', async () => {
    guardApi({ result: 'denied', reason: 'expired', name: 'Old Pass', flat: 'B-2' });
    renderApp(<Gate />);
    await userEvent.type(await screen.findByLabelText('6-digit code'), '000111');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    const card = await screen.findByTestId('gate-result');
    expect(card).toHaveTextContent('DENIED');
    expect(card).toHaveTextContent('This pass has expired.');
  });

  it('turns a server error into a DENIED card', async () => {
    mockApi({
      'GET /api/me': guard, 'GET /api/settings': settings, 'GET /api/gate/log': [],
      'POST /api/gate/verify': () => ({ status: 429, json: { error: 'Too many attempts' } }),
    });
    renderApp(<Gate />);
    await userEvent.type(await screen.findByLabelText('6-digit code'), '111111');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(await screen.findByTestId('gate-result')).toHaveTextContent('Too many attempts');
  });

  it('hides the camera button when BarcodeDetector is not supported', async () => {
    guardApi({ result: 'allowed' });
    renderApp(<Gate />);
    expect(await screen.findByText(/QR scanning is not supported/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scan QR/ })).not.toBeInTheDocument();
  });
});

describe('gate pass', () => {
  it('creates a pass and shows its QR, 6-digit code and share, copy and cancel actions', async () => {
    const pass = {
      id: 3, flat: 'A-101', visitor_name: 'Dev Visitor', purpose: 'Guest', code: '123456', qr: 'HSP:tok', valid_from: '2026-11-04 10:00:00',
      valid_until: '2026-11-05 10:00:00', status: 'active', created_by_name: 'Asha', used_at: null,
    };
    let made = false;
    const { calls } = mockApi({
      'GET /api/me': resident(), 'GET /api/settings': settings,
      'GET /api/gate/passes': () => ({ json: made ? [pass] : [] }),
      'GET /api/gate/me': { token: 'mine', qr: 'HSP:mine', nfc: 'HSP:mine' },
      'POST /api/gate/passes': () => { made = true; return { json: { id: 3, token: 'tok', code: '123456', qr: 'HSP:tok' } }; },
      'POST /api/gate/passes/3/cancel': { json: { ok: true } },
      'POST /api/gate/me/rotate': { json: { token: 'new', qr: 'HSP:new', nfc: 'HSP:new' } },
    });
    renderApp(<GatePass />);
    await userEvent.type(await screen.findByLabelText('Visitor name'), 'Dev Visitor');
    await userEvent.click(screen.getByRole('button', { name: /Create pass/ }));
    const card = await screen.findByLabelText('Pass details');
    expect(within(card).getByText('123456')).toBeInTheDocument();
    expect(within(card).getByTestId('qr')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Share/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Copy code/ })).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'POST' && c.url === '/api/gate/passes')?.body as Record<string, string>;
    expect(body.visitor_name).toBe('Dev Visitor');
    expect(new Date(body.valid_until).getTime()).toBeGreaterThan(new Date(body.valid_from).getTime());
    // cancel needs an inline confirm
    await userEvent.click(within(card).getByRole('button', { name: /Cancel pass/ }));
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false);
    await userEvent.click(within(card).getByRole('button', { name: 'Yes, cancel' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/gate/passes/3/cancel')).toBe(true));
    // my gate QR reset also asks first
    const mine = await screen.findByLabelText('My gate QR');
    await userEvent.click(within(mine).getByRole('button', { name: /Reset my QR/ }));
    await userEvent.click(within(mine).getByRole('button', { name: 'Yes, reset' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/gate/me/rotate')).toBe(true));
  });
});
