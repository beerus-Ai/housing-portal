import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AiInfo, Me, RequestDetail } from '../api';
import Dashboard from '../pages/Dashboard';
import Notices from '../pages/Notices';
import { RequestDetailPage } from '../pages/Requests';
import Settings from '../pages/Settings';
import { mockApi, renderApp, resident, settings } from './helpers';

const admin: Me = { ...resident(), role: 'admin', resident_type: null, flat: null, name: 'Society Admin' };
const base = (me: Me) => ({ 'GET /api/me': me, 'GET /api/settings': settings });
const stats = { pending_users: 0, unassigned: 0, sla: { overdue: 0 }, oldest_open: [] };
const ovr = (ai: object) => ({ requests: { open: 1 }, ai: { mode: 'rules', sla_hours: 48, triaged: 3, ...ai } });

describe('Dashboard WhatsApp card', () => {
  it('is dark with urgent and escalated counts', async () => {
    mockApi({ ...base(admin), 'GET /api/admin/stats': stats, 'GET /api/admin/overview': ovr({ whatsapp_requests_30d: 4, urgent_open: 2, escalated_open: 1 }), 'GET /api/emergencies': [] });
    renderApp(<Dashboard />);
    const card = await screen.findByRole('link', { name: /Via WhatsApp: 4/ });
    expect(card).toHaveTextContent('2 urgent · 1 escalated');
    expect(card).toHaveClass('t-ink');
    expect(card).toHaveAttribute('href', '/settings?tab=ai');
  });
  it('is a calm tint card when nothing is urgent', async () => {
    mockApi({ ...base(admin), 'GET /api/admin/stats': stats, 'GET /api/admin/overview': ovr({ whatsapp_requests_30d: 0, urgent_open: 0, escalated_open: 0 }), 'GET /api/emergencies': [] });
    renderApp(<Dashboard />);
    const card = await screen.findByRole('link', { name: /Via WhatsApp: 0/ });
    expect(card).toHaveTextContent('AI triage is on');
    expect(card).toHaveClass('t-sky');
  });
});

const ai = { category: 'lift', priority: 'urgent', summary: 'Lift stuck on floor 3', vendor_id: 5, source: 'rules' as const };
const detail = (over: Partial<RequestDetail> = {}): RequestDetail => ({
  id: 7, user_id: 2, category: 'lift', title: 'Lift stuck', description: 'Floor 3', status: 'open', vendor_id: null, vendor_name: null,
  resident_name: 'Asha Rao', flat: 'A-101', rating: null, rating_comment: null, has_photo: false, can_rate: false,
  created_at: '2026-11-01 10:00:00', updated_at: '2026-11-01 10:00:00', history: [], source: 'whatsapp', escalated_at: '2026-11-02 10:00:00', ai, ...over,
});
const page = <Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes>;

describe('AI suggestion', () => {
  it('shows for the committee and assigns the suggested vendor', async () => {
    const { calls } = mockApi({
      ...base(admin), 'GET /api/requests/7': detail(), 'GET /api/requests/7/comments': [],
      'GET /api/vendors': [{ id: 5, name: 'Otis Lifts', trade: 'lift' }], 'POST /api/requests/7/assign': { ok: true },
    });
    renderApp(page, '/requests/7');
    expect(await screen.findByText(/came in on WhatsApp/)).toBeInTheDocument();
    expect(screen.getByText('Lift stuck on floor 3')).toBeInTheDocument();
    expect(screen.getByText(/escalated/)).toBeInTheDocument();
    expect(screen.getByText(/The committee decides/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Assign Otis Lifts' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/requests/7/assign')?.body).toEqual({ vendor_id: 5 }));
  });
  it('is hidden from residents', async () => {
    mockApi({ ...base(resident()), 'GET /api/requests/7': detail({ ai: undefined }), 'GET /api/requests/7/comments': [] });
    renderApp(page, '/requests/7');
    await screen.findByRole('heading', { name: 'Lift stuck' });
    expect(screen.queryByText(/AI suggestion/)).not.toBeInTheDocument();
  });
});

describe('Draft with AI', () => {
  it('fills headline and details from rough text', async () => {
    const { calls } = mockApi({
      ...base(admin), 'GET /api/notices': [],
      'POST /api/admin/ai/draft-notice': { title: 'Water cut on Friday', body: 'Water will be off 10am to 2pm.', source: 'rules' },
    });
    renderApp(<Notices />);
    const btn = await screen.findByRole('button', { name: /Draft with AI/ });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Message'), 'water off fri 10-2');
    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Water cut on Friday'));
    expect(screen.getByLabelText('Message')).toHaveValue('Water will be off 10am to 2pm.');
    expect(screen.getByText('Draft ready. Check it before posting.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('draft-notice'))?.body).toEqual({ text: 'water off fri 10-2' });
  });
});

const aiInfo: AiInfo = {
  mode: 'rules', sla_hours: 48, whatsapp_live: false, webhook_path: '/api/whatsapp/webhook', webhook_secret: 'abc',
  counts: { whatsapp_requests: 2, messages_in: 3, messages_out: 2, triaged: 5 },
  messages: [
    { id: 1, direction: 'in', phone: '+911', body: 'Lift is stuck', status: 'received', request_id: 9, created_at: '', resident: 'Asha Rao', flat: 'A-101' },
    { id: 2, direction: 'out', phone: '+911', body: 'Request logged', status: 'logged', request_id: 9, created_at: '', resident: 'Asha Rao', flat: 'A-101' },
  ],
};

describe('Settings AI tab', () => {
  it('shows tiles, webhook and messages, and runs the simulator', async () => {
    const { calls } = mockApi({
      ...base(admin), 'GET /api/admin/ai': aiInfo,
      'POST /api/admin/whatsapp/simulate': { created: 12, replies: ['ok'] },
    });
    renderApp(<Settings />, '/settings?tab=ai');
    expect(await screen.findByText('Keyword rules')).toBeInTheDocument();
    expect(screen.getByText('48 hours')).toBeInTheDocument();
    expect(screen.getByText(`${location.origin}/api/whatsapp/webhook?secret=abc`)).toBeInTheDocument();
    expect(screen.getByText('Lift is stuck')).toBeInTheDocument();
    expect(screen.getByText('Request logged')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Resident phone'), '+911');
    await userEvent.type(screen.getByLabelText('WhatsApp message'), 'Tap leaking');
    await userEvent.click(screen.getByRole('button', { name: /Send as resident/ }));
    expect(await screen.findByText('Request #12 created from WhatsApp')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('simulate'))?.body).toEqual({ phone: '+911', text: 'Tap leaking' });
  });
});
