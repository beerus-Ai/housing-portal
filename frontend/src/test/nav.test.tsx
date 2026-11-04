import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '../auth/guards';
import { Shell } from '../components/Shell';
import { navFor } from '../nav';
import { mockApi, renderApp, resident, settings } from './helpers';
import type { Me } from '../api';

const labels = (me: Me) => navFor(me).map((i) => i.label);
const admin: Me = { ...resident(), role: 'admin', resident_type: null, flat: null, name: 'Society Admin' };

describe('navFor', () => {
  it('filters resident items by permissions', () => {
    expect(labels(resident())).toContain('Gate pass');
    expect(labels(resident({ permissions: ['notice.read'] }))).not.toContain('Gate pass');
    expect(labels(resident({ permissions: [] }))).not.toContain('Raise a request');
    expect(labels(resident({ resident_type: 'tenant', permissions: [] }))).not.toContain('My lease');
    expect(labels(resident({ resident_type: 'tenant' }))).toContain('My lease');
  });
  it('filters by feature flags', () => {
    const off = resident({ features: { gate: false, emergency: false, contacts: true, notices: true } });
    expect(labels(off)).not.toContain('Gate pass');
    expect(labels(off)).not.toContain('Emergency');
    expect(labels(off)).toContain('Contacts');
    expect(labels(resident({ features: { contacts: false } }))).not.toContain('Contacts');
  });
  it('gives each role its own items', () => {
    expect(labels(admin)).toEqual(expect.arrayContaining(['Dashboard', 'Approvals', 'Settings']));
    expect(labels(admin)).not.toContain('Home');
    expect(labels(resident())).not.toContain('Settings');
    expect(labels({ ...resident(), role: 'guard' })).toEqual(['Gate', 'Log', 'Profile']);
  });
});

function shellFor(me: Me) {
  mockApi({
    'GET /api/me': me, 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 3 },
    'GET /api/admin/users': [],
  });
  return renderApp(
    <Routes><Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<p>CONTENT</p>} /></Route></Route></Routes>,
  );
}

describe('Shell', () => {
  it('renders filtered nav, society name and unread bell', async () => {
    shellFor(resident({ permissions: ['request.create'] }));
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Raise a request')).toBeInTheDocument();
    expect(within(nav).queryByText('Gate pass')).not.toBeInTheDocument();
    expect(screen.getByText('Test Heights')).toBeInTheDocument();
    expect(await screen.findByTestId('unread')).toHaveTextContent('3');
  });

  it('lets the user move the menu to the top, hide it and persist to hp.nav', async () => {
    shellFor(resident());
    await screen.findByRole('navigation', { name: 'Main' });
    expect(document.querySelector('.shell')).toHaveClass('side');
    await userEvent.click(screen.getByRole('button', { name: 'Move menu to the top' }));
    expect(document.querySelector('.shell')).toHaveClass('top');
    expect(JSON.parse(localStorage.getItem('hp.nav')!)).toEqual({ pos: 'top', hidden: false });
    await userEvent.click(screen.getByRole('button', { name: 'Hide menu' }));
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('hp.nav')!)).toEqual({ pos: 'top', hidden: true });
    await userEvent.click(screen.getByRole('button', { name: 'Show menu' }));
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('restores the saved layout from hp.nav', async () => {
    localStorage.setItem('hp.nav', JSON.stringify({ pos: 'top', hidden: false }));
    shellFor(resident());
    await screen.findByRole('navigation', { name: 'Main' });
    expect(document.querySelector('.shell')).toHaveClass('top');
  });

  it('shows the committee items for an admin', async () => {
    shellFor(admin);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Settings')).toBeInTheDocument();
  });

  it('signs out and returns to the login page', async () => {
    mockApi({
      'GET /api/me': resident(), 'GET /api/settings': settings, 'GET /api/notifications/unread-count': { n: 0 },
      'POST /api/logout': { ok: true },
    });
    renderApp(
      <Routes>
        <Route path="/login" element={<p>LOGIN PAGE</p>} />
        <Route element={<RequireAuth />}><Route element={<Shell />}><Route index element={<p>CONTENT</p>} /></Route></Route>
      </Routes>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });
});
