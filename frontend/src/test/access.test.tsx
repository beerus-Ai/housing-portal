import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AccessResponse } from '../api';
import { AccessPanel } from '../pages/settings/Access';
import { mockApi, renderApp } from './helpers';

const base = (): AccessResponse => ({
  roles: ['owner', 'tenant', 'family'],
  permissions: [{ key: 'gate.pass', label: 'Create visitor gate passes' }, { key: 'notice.read', label: 'Read notices' }],
  matrix: {
    owner: { 'gate.pass': true, 'notice.read': true },
    tenant: { 'gate.pass': true, 'notice.read': true },
    family: { 'gate.pass': false, 'notice.read': true },
  },
});

describe('Access control matrix', () => {
  it('toggles, tracks dirty state, discards and saves the full matrix', async () => {
    let saved: unknown;
    const { calls } = mockApi({
      'GET /api/admin/access': base(),
      'PUT /api/admin/access': (body: unknown) => {
        saved = body;
        const r = base();
        r.matrix = (body as { matrix: AccessResponse['matrix'] }).matrix;
        return { json: r };
      },
    });
    renderApp(<AccessPanel />);
    const save = await screen.findByRole('button', { name: 'Save changes' });
    const discard = screen.getByRole('button', { name: 'Discard' });
    expect(save).toBeDisabled();
    expect(discard).toBeDisabled();

    const sw = screen.getByRole('switch', { name: 'Tenant: Create visitor gate passes' });
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    expect(sw).not.toBeChecked();
    expect(save).toBeEnabled();
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

    await userEvent.click(discard);
    expect(sw).toBeChecked();
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole('switch', { name: 'Family: Create visitor gate passes' }));
    await userEvent.click(sw);
    await userEvent.click(save);
    await waitFor(() => expect(screen.getByText('Access saved.')).toBeInTheDocument());
    expect(saved).toEqual({ matrix: {
      owner: { 'gate.pass': true, 'notice.read': true },
      tenant: { 'gate.pass': false, 'notice.read': true },
      family: { 'gate.pass': true, 'notice.read': true },
    } });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows the server error when saving fails and keeps the draft', async () => {
    mockApi({
      'GET /api/admin/access': base(),
      'PUT /api/admin/access': () => ({ status: 400, json: { error: 'Unknown permission' } }),
    });
    renderApp(<AccessPanel />);
    const sw = await screen.findByRole('switch', { name: 'Owner: Read notices' });
    await userEvent.click(sw);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown permission');
    expect(sw).not.toBeChecked();
  });
});
