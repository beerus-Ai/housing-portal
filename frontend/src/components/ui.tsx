import { useState, type ReactNode } from 'react';
import type { ServiceRequest } from '../api';
import { Icon } from './Icon';

export const CATEGORIES = ['plumbing', 'electrical', 'lift', 'security', 'housekeeping', 'other'] as const;

const STEPS: [string, string][] = [
  ['Raised', 'note-pencil'], ['Assigned', 'user-gear'], ['In progress', 'wrench'], ['Resolved', 'check'], ['Closed', 'star'],
];

/** The design's 5-step tracker: Resolved = closed, Closed = closed and rated. */
export function stepOf(r: Pick<ServiceRequest, 'status' | 'rating'>): number {
  if (r.status === 'closed') return r.rating ? 4 : 3;
  return { open: 0, assigned: 1, in_progress: 2 }[r.status];
}

export function statusText(r: Pick<ServiceRequest, 'status' | 'rating'>): string {
  return ['Open', 'Assigned', 'In progress', 'Resolved, awaiting rating', 'Closed'][stepOf(r)];
}

export function Tracker({ request }: { request: Pick<ServiceRequest, 'status' | 'rating'> }) {
  const at = stepOf(request);
  return (
    <ol className="tracker" aria-label="Progress">
      {STEPS.map(([label, icon], i) => (
        <li key={label} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="tr-dot"><Icon name={i < at ? 'check' : icon} /></span>
          <span className="tr-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function StatusPill({ request }: { request: Pick<ServiceRequest, 'status' | 'rating'> }) {
  return <span className={`pill rq-${stepOf(request)}`}>{statusText(request)}</span>;
}

/** Destructive action with an inline "Are you sure?" instead of a browser dialog. */
export function ConfirmButton({ label, confirmLabel = 'Yes, delete', busy, onConfirm, ariaLabel }: {
  label: ReactNode; confirmLabel?: string; busy?: boolean; onConfirm: () => void; ariaLabel?: string;
}) {
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return <button type="button" className="btn btn-ghost" aria-label={ariaLabel} onClick={() => setAsk(true)}>{label}</button>;
  }
  return (
    <span className="inline-confirm" role="group" aria-label="Confirm">
      <span>Are you sure?</span>
      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { setAsk(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setAsk(false)}>Cancel</button>
    </span>
  );
}

export function ErrorBanner({ error }: { error: Error | null | undefined }) {
  return error ? <p className="banner err" role="alert">{error.message}</p> : null;
}

/** Whole days from today to a YYYY-MM-DD date (negative once passed). */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}
