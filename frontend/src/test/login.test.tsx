import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GuestOnly } from '../auth/guards';
import Login from '../pages/Login';
import { mockApi, renderApp, resident, settings, signedOut } from './helpers';

const tree = (
  <Routes>
    <Route element={<GuestOnly />}><Route path="/login" element={<Login />} /></Route>
    <Route path="/" element={<p>HOME PAGE</p>} />
  </Routes>
);

describe('Login', () => {
  it('shows the welcome card, toggles password visibility and hides Google without a client id', async () => {
    mockApi({ 'GET /api/me': signedOut, 'GET /api/settings': settings });
    renderApp(tree, '/login');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.queryByText(/Continue with Google/)).not.toBeInTheDocument();
  });

  it('shows Continue with Google only when a client id is configured', async () => {
    mockApi({ 'GET /api/me': signedOut, 'GET /api/settings': { ...settings, google_client_id: 'abc.apps.googleusercontent.com' } });
    renderApp(tree, '/login');
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it('shows the server error message and shakes when sign-in fails', async () => {
    mockApi({
      'GET /api/me': signedOut,
      'GET /api/settings': settings,
      'POST /api/login': () => ({ status: 401, json: { error: 'Invalid email or password' } }),
    });
    renderApp(tree, '/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(document.querySelector('.auth-card')).toHaveClass('shake');
  });

  it('signs in with the typed credentials and moves on once /api/me answers', async () => {
    let signedIn = false;
    const { calls } = mockApi({
      'GET /api/me': () => (signedIn ? { json: resident() } : signedOut()),
      'GET /api/settings': settings,
      'POST /api/login': () => { signedIn = true; return { json: resident() }; },
    });
    renderApp(tree, '/login');
    await userEvent.type(await screen.findByLabelText('Email'), ' asha@example.test ');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('HOME PAGE')).toBeInTheDocument());
    const login = calls.find((c) => c.url === '/api/login');
    expect(login?.body).toEqual({ email: 'asha@example.test', password: 'secret-pass-1' });
  });

  it('opens the Join form with type tiles and consent', async () => {
    mockApi({ 'GET /api/me': signedOut, 'GET /api/settings': settings });
    renderApp(tree, '/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(screen.getByRole('radio', { name: 'Owner' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Tenant' }));
    expect(screen.getByRole('radio', { name: 'Tenant' })).toBeChecked();
    expect(screen.getByLabelText(/I agree/)).not.toBeChecked();
  });
});
