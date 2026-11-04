import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Me } from '../api';
import { daysUntil } from '../components/ui';
import Audit from '../pages/Audit';
import Household from '../pages/Household';
import { daysLeftText, Leases, MyLease } from '../pages/Leases';
import { Alerts, Approvals } from '../pages/Misc';
import Notices from '../pages/Notices';
import Profile from '../pages/Profile';
import Vendors from '../pages/Vendors';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../auth/guards';
import { mockApi, renderApp, resident, settings } from './helpers';

const admin: Me = { ...resident(), role: 'admin', resident_type: null, flat: null, name: 'Society Admin' };
const base = (me: Me) => ({ 'GET /api/me': me, 'GET /api/settings': settings });

describe('Notices', () => {
  const notice = { id: 1, title: 'Water cut', body: 'Tuesday 10am', author_id: 1, author: 'Society Admin', created_at: '2026-11-01 10:00:00' };
  it('residents only read', async () => {
    mockApi({ ...base(resident()), 'GET /api/notices': [notice] });
    renderApp(<Notices />);
    expect(await screen.findByText('Water cut')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Post a notice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });
  it('committee posts and deletes after an inline confirm', async () => {
    let posted: unknown;
    let deleted = false;
    mockApi({
      ...base(admin), 'GET /api/notices': [notice],
      'POST /api/notices': (b: unknown) => { posted = b; return { status: 201, json: { id: 2 } }; },
      'DELETE /api/notices/1': () => { deleted = true; return { json: { ok: true } }; },
    });
    renderApp(<Notices />);
    await screen.findByText('Water cut');
    const post = screen.getByRole('button', { name: 'Post notice' });
    expect(post).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Title'), 'AGM');
    await userEvent.type(screen.getByLabelText('Message'), 'Sunday');
    await userEvent.click(post);
    await waitFor(() => expect(posted).toEqual({ title: 'AGM', body: 'Sunday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Water cut' }));
    expect(deleted).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(deleted).toBe(true));
  });
});

describe('Household', () => {
  const members = [{ id: 2, name: 'Asha Rao', resident_type: 'owner', status: 'approved', phone: null }];
  it('hides the add form from non-owners', async () => {
    mockApi({ ...base(resident({ resident_type: 'family' })), 'GET /api/household': members });
    renderApp(<Household />);
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add a household member' })).not.toBeInTheDocument();
  });
  it('lets an owner add a member with validation', async () => {
    let sent: unknown;
    mockApi({ ...base(resident()), 'GET /api/household': members, 'POST /api/household': (b: unknown) => { sent = b; return { status: 201, json: { id: 9 } }; } });
    renderApp(<Household />);
    await screen.findByText('Asha Rao');
    await userEvent.click(screen.getByRole('button', { name: 'Add to household' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Kiran Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'kiran@example.test');
    await userEvent.type(screen.getByLabelText('Temporary password'), 'Temp@12345');
    await userEvent.click(screen.getByRole('button', { name: 'Add to household' }));
    expect(screen.getByText('Consent is required')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Add to household' }));
    await waitFor(() => expect(sent).toEqual({ name: 'Kiran Rao', email: 'kiran@example.test', phone: '', resident_type: 'family', password: 'Temp@12345', consent: true }));
    expect(await screen.findByText(/Kiran Rao was added/)).toBeInTheDocument();
  });
});

describe('Vendors', () => {
  it('adds, edits and deletes (409 shown) with inline confirm', async () => {
    const log: string[] = [];
    mockApi({
      ...base(admin),
      'GET /api/vendors': [{ id: 1, name: 'Ravi Plumbers', trade: 'Plumbing', phone: '999' }],
      'POST /api/vendors': (b: unknown) => { log.push('post ' + JSON.stringify(b)); return { status: 201, json: { id: 2 } }; },
      'PUT /api/vendors/1': (b: unknown) => { log.push('put ' + JSON.stringify(b)); return { json: { ok: true } }; },
      'DELETE /api/vendors/1': () => ({ status: 409, json: { error: 'This vendor has requests on record and cannot be deleted' } }),
    });
    renderApp(<Vendors />);
    await screen.findByText('Ravi Plumbers');
    await userEvent.type(screen.getByLabelText('Name'), 'Sparks');
    await userEvent.type(screen.getByLabelText('Trade'), 'Electrical');
    await userEvent.click(screen.getByRole('button', { name: 'Add vendor' }));
    await waitFor(() => expect(log).toContain('post {"name":"Sparks","trade":"Electrical","phone":""}'));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Ravi Plumbers' }));
    const name = screen.getAllByLabelText('Name').at(-1)!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Ravi & Sons');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(log.some((l) => l.startsWith('put') && l.includes('Ravi & Sons'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText(/cannot be deleted/)).toBeInTheDocument();
  });
});

describe('Leases', () => {
  it('computes days left', () => {
    const now = new Date(2026, 10, 4);
    expect(daysUntil('2026-11-14', now)).toBe(10);
    expect(daysLeftText('2026-11-05', now)).toBe('1 day left');
    expect(daysLeftText('2026-11-04', now)).toBe('Ends today');
    expect(daysLeftText('2026-11-01', now)).toBe('Ended 3 days ago');
  });
  it('tenant sees an empty state or days left', async () => {
    mockApi({ ...base(resident({ resident_type: 'tenant' })), 'GET /api/lease': null });
    renderApp(<MyLease />);
    expect(await screen.findByText('Not set yet')).toBeInTheDocument();
  });
  it('tenant sees the lease', async () => {
    const end = new Date(Date.now() + 40 * 86_400_000);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    mockApi({
      ...base(resident({ resident_type: 'tenant' })),
      'GET /api/lease': { id: 1, user_id: 2, start_date: '2026-01-01', end_date: iso, owner_name: 'Mr Owner', owner_phone: '', police_verified_on: '', agreement: '', parking: 'P-4' },
    });
    renderApp(<MyLease />);
    expect(await screen.findByTestId('days-left')).toHaveTextContent('40 days left');
    expect(screen.getByText('Mr Owner')).toBeInTheDocument();
  });
  it('committee edits a lease and gets date validation', async () => {
    let sent: unknown;
    mockApi({
      ...base(admin),
      'GET /api/admin/leases': [{ user_id: 5, name: 'Rohit', flat: 'B-2', email: 'r@example.test', phone: null, start_date: null, end_date: null, owner_name: null, owner_phone: null, police_verified_on: null, agreement: null, parking: null }],
      'PUT /api/admin/users/5/lease': (b: unknown) => { sent = b; return { json: { ok: true } }; },
    });
    renderApp(<Leases />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit lease for Rohit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save lease' }));
    expect(screen.getByText('Start and end dates are required')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Start date'), '2026-05-01');
    await userEvent.type(screen.getByLabelText('End date'), '2026-04-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save lease' }));
    expect(screen.getByText('The end date must be after the start date')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('End date'));
    await userEvent.type(screen.getByLabelText('End date'), '2027-04-30');
    await userEvent.click(screen.getByRole('button', { name: 'Save lease' }));
    await waitFor(() => expect(sent).toMatchObject({ start_date: '2026-05-01', end_date: '2027-04-30' }));
  });
});

describe('Audit trail', () => {
  it('lists entries and links the CSV export', async () => {
    mockApi({
      ...base(admin),
      'GET /api/admin/audit': [{ id: 1, entity: 'request', entity_id: 3, action: 'status', detail: 'open -> assigned', created_at: '2026-11-01 10:00:00', actor: 'Society Admin' }],
    });
    renderApp(<Audit />);
    expect(await screen.findByText('open -> assigned')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Export CSV/ })).toHaveAttribute('href', '/api/admin/export.csv');
  });
});

describe('Alerts and approvals', () => {
  it('marks alerts read', async () => {
    let marked = false;
    mockApi({
      ...base(resident()),
      'GET /api/notifications': [{ id: 1, user_id: 2, message: 'Your request is assigned', is_read: 0, created_at: '2026-11-01 10:00:00' }],
      'POST /api/notifications/read': () => { marked = true; return { json: { ok: true } }; },
      'GET /api/notifications/unread-count': { n: 0 },
    });
    renderApp(<Alerts />);
    expect(await screen.findByText('Your request is assigned')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(marked).toBe(true));
  });
  it('approves and rejects', async () => {
    const calls: string[] = [];
    mockApi({
      ...base(admin),
      'GET /api/admin/users': [{ id: 8, name: 'New Person', email: 'n@example.test', phone: null, flat: 'C-3', resident_type: 'owner', role: 'resident', status: 'pending', created_at: '' }],
      'POST /api/admin/users/8/approve': () => { calls.push('approve'); return { json: { ok: true } }; },
      'POST /api/admin/users/8/reject': () => { calls.push('reject'); return { json: { ok: true } }; },
    });
    renderApp(<Approvals />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(calls).toEqual(['approve', 'reject']));
  });
});

describe('Profile', () => {
  it('saves details', async () => {
    let sent: unknown;
    mockApi({ ...base(resident()), 'PATCH /api/me': (b: unknown) => { sent = b; return { json: resident() }; } });
    renderApp(<Routes><Route element={<RequireAuth />}><Route index element={<Profile />} /></Route></Routes>);
    const name = await screen.findByLabelText('Name');
    await waitFor(() => expect(name).toHaveValue('Asha Rao'));
    await userEvent.clear(name);
    await userEvent.type(name, 'Asha R');
    await userEvent.type(screen.getByLabelText('Phone'), '98765');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(sent).toEqual({ name: 'Asha R', phone: '98765' }));
    expect(await screen.findByText('Details saved.')).toBeInTheDocument();
  });
  it('validates and changes the password', async () => {
    let sent: unknown;
    mockApi({ ...base(resident()), 'POST /api/me/password': (b: unknown) => { sent = b; return { json: { ok: true } }; } });
    renderApp(<Routes><Route element={<RequireAuth />}><Route index element={<Profile />} /></Route></Routes>);
    await screen.findByLabelText('Current password');
    await userEvent.type(screen.getByLabelText('Current password'), 'Old@12345');
    await userEvent.type(screen.getByLabelText('New password'), 'New@12345');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'Other@123');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('The two new passwords do not match')).toBeInTheDocument();
    expect(sent).toBeUndefined();
    await userEvent.clear(screen.getByLabelText('Repeat new password'));
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'New@12345');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(sent).toEqual({ current: 'Old@12345', next: 'New@12345' }));
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });
});
