import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Me, RequestDetail, ServiceRequest } from '../api';
import Raise from '../pages/Raise';
import { RequestDetailPage, RequestList } from '../pages/Requests';
import { stepOf } from '../components/ui';
import { mockApi, renderApp, resident, settings } from './helpers';

const admin: Me = { ...resident(), role: 'admin', resident_type: null, flat: null, name: 'Society Admin' };

const req = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 7, user_id: 2, category: 'plumbing', title: 'Tap leaking', description: 'Kitchen tap', status: 'open', vendor_id: null, vendor_name: null,
  resident_name: 'Asha Rao', flat: 'A-101', rating: null, rating_comment: null, has_photo: false, can_rate: false,
  created_at: '2026-11-01 10:00:00', updated_at: '2026-11-01 10:00:00', ...over,
});
const detail = (over: Partial<RequestDetail> = {}): RequestDetail => ({
  ...req(), history: [{ action: 'created', detail: 'plumbing: Tap leaking', created_at: '2026-11-01 10:00:00', actor: 'Asha Rao' }], ...over,
});

const page = (el: JSX.Element, path: string) => (
  <Routes><Route path={path} element={el} /><Route path="/requests" element={<p>LIST</p>} /></Routes>
);
const base = (me: Me) => ({ 'GET /api/me': me, 'GET /api/settings': settings });

describe('step mapping', () => {
  it('maps closed to Resolved until rated', () => {
    expect(stepOf({ status: 'closed', rating: null })).toBe(3);
    expect(stepOf({ status: 'closed', rating: 5 })).toBe(4);
    expect(stepOf({ status: 'open', rating: null })).toBe(0);
  });
});

describe('Request list', () => {
  it('lists requests and sends the status and category filters', async () => {
    const { calls } = mockApi({
      ...base(resident()),
      'GET /api/requests': [req(), req({ id: 8, title: 'Lift stuck', category: 'lift', status: 'closed', rating: 4 })],
    });
    renderApp(page(<RequestList />, '/requests'), '/requests');
    expect(await screen.findByText('Tap leaking')).toBeInTheDocument();
    expect(document.querySelector('.pill.rq-4')).toHaveTextContent('Closed');
    await userEvent.click(screen.getByRole('button', { name: 'In progress' }));
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'lift');
    await waitFor(() => expect(calls.some((c) => c.url === '/api/requests?status=in_progress&category=lift')).toBe(true));
  });
  it('shows an empty state', async () => {
    mockApi({ ...base(resident()), 'GET /api/requests': [] });
    renderApp(page(<RequestList />, '/requests'), '/requests');
    expect(await screen.findByText('No requests here')).toBeInTheDocument();
  });
});

describe('Request detail', () => {
  it('shows tracker, history, comments and posts a comment', async () => {
    let sent: unknown;
    mockApi({
      ...base(resident()),
      'GET /api/requests/7': detail({ status: 'in_progress', vendor_id: 1, vendor_name: 'Ravi Plumbers', has_photo: true }),
      'GET /api/requests/7/comments': [{ id: 1, body: 'On our way', created_at: '2026-11-02 09:00:00', author: 'Society Admin', role: 'admin' }],
      'POST /api/requests/7/comments': (b: unknown) => { sent = b; return { json: { id: 2 } }; },
    });
    renderApp(page(<RequestDetailPage />, '/requests/:id'), '/requests/7');
    expect(await screen.findByRole('heading', { name: 'Tap leaking' })).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(steps[2]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByAltText('Photo attached to the request')).toHaveAttribute('src', '/api/requests/7/photo');
    expect(screen.getByText('Ravi Plumbers')).toBeInTheDocument();
    expect(await screen.findByText('On our way')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Write a message'), 'Thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toEqual({ body: 'Thanks' }));
    expect(screen.queryByRole('region', { name: 'Committee actions' })).not.toBeInTheDocument();
  });

  it('lets the owner rate a resolved request', async () => {
    let sent: unknown;
    mockApi({
      ...base(resident()),
      'GET /api/requests/7': detail({ status: 'closed', can_rate: true, vendor_id: 1 }),
      'GET /api/requests/7/comments': [],
      'POST /api/requests/7/rate': (b: unknown) => { sent = b; return { json: { ok: true } }; },
    });
    renderApp(page(<RequestDetailPage />, '/requests/:id'), '/requests/7');
    const submit = await screen.findByRole('button', { name: 'Submit rating' });
    expect(submit).toBeDisabled();
    expect(screen.getAllByText('Resolved, awaiting rating').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    await userEvent.click(submit);
    await waitFor(() => expect(sent).toEqual({ rating: 4 }));
  });

  it('does not offer rating when the API says the user cannot rate', async () => {
    mockApi({ ...base(resident({ resident_type: 'family' })), 'GET /api/requests/7': detail({ status: 'closed', can_rate: false }), 'GET /api/requests/7/comments': [] });
    renderApp(page(<RequestDetailPage />, '/requests/:id'), '/requests/7');
    expect(await screen.findByText(/Waiting for the flat owner/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit rating' })).not.toBeInTheDocument();
  });

  it('lets the committee assign a vendor and move the status', async () => {
    const sent: Record<string, unknown> = {};
    mockApi({
      ...base(admin),
      'GET /api/requests/7': detail({ status: 'assigned', vendor_id: 1, vendor_name: 'Ravi Plumbers' }),
      'GET /api/requests/7/comments': [],
      'GET /api/vendors': [{ id: 1, name: 'Ravi Plumbers', trade: 'plumbing', phone: '' }, { id: 2, name: 'Sparks', trade: 'electrical', phone: '' }],
      'POST /api/requests/7/assign': (b: unknown) => { sent.assign = b; return { json: { ok: true } }; },
      'POST /api/requests/7/status': (b: unknown) => { sent.status = b; return { json: { ok: true } }; },
    });
    renderApp(page(<RequestDetailPage />, '/requests/:id'), '/requests/7');
    const select = await screen.findByLabelText('Change vendor');
    await screen.findByRole('option', { name: 'Sparks (electrical)' });
    await userEvent.selectOptions(select, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(sent.assign).toEqual({ vendor_id: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Start work' }));
    await waitFor(() => expect(sent.status).toEqual({ status: 'in_progress' }));
    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Done');
    await userEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() => expect(sent.status).toEqual({ status: 'closed', note: 'Done' }));
  });

  it('shows the server error for a missing request', async () => {
    mockApi({ ...base(resident()), 'GET /api/requests/99': () => ({ status: 404, json: { error: 'Request not found' } }) });
    renderApp(page(<RequestDetailPage />, '/requests/:id'), '/requests/99');
    expect(await screen.findByText('Request not found')).toBeInTheDocument();
  });
});

describe('Raise a request', () => {
  it('validates, uploads the photo as multipart and opens the new request', async () => {
    let form: FormData | undefined;
    mockApi({
      ...base(resident()),
      'POST /api/requests': ((b: unknown) => { form = b as FormData; return { status: 201, json: { id: 12 } }; }),
      'GET /api/requests/12': detail({ id: 12 }),
      'GET /api/requests/12/comments': [],
    });
    renderApp(<Routes><Route path="/raise" element={<Raise />} /><Route path="/requests/:id" element={<p>DETAIL</p>} /></Routes>, '/raise');
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText('Choose what the request is about')).toBeInTheDocument();
    expect(screen.getByText('Add a short title')).toBeInTheDocument();
    expect(form).toBeUndefined();

    await userEvent.click(screen.getByRole('radio', { name: 'Electrical' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Socket sparks');
    const bad = new File(['x'], 'a.gif', { type: 'image/gif' });
    await userEvent.upload(screen.getByLabelText('Photo (optional)'), bad, { applyAccept: false });
    expect(screen.getByText('Only JPEG, PNG or WebP photos are allowed')).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Photo (optional)'), new File(['x'], 'a.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('DETAIL')).toBeInTheDocument();
    expect(form?.get('category')).toBe('electrical');
    expect(form?.get('title')).toBe('Socket sparks');
    expect((form?.get('photo') as File).name).toBe('a.png');
  });

  it('shows the server error', async () => {
    mockApi({ ...base(resident()), 'POST /api/requests': () => ({ status: 400, json: { error: 'Valid category and title are required' } }) });
    renderApp(<Raise />, '/');
    await userEvent.click(await screen.findByRole('radio', { name: 'Lift' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Stuck');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Valid category and title are required');
  });
});
