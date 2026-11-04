/** The API stores UTC as "YYYY-MM-DD HH:MM:SS". */
export function parseTs(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
}

export function ago(s: string): string {
  const d = Date.now() - parseTs(s).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days}d ago` : parseTs(s).toLocaleDateString();
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const firstName = (n: string): string => n.trim().split(/\s+/)[0] ?? n;

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', in_progress: 'In progress', closed: 'Closed',
};
export const CATEGORY_ICON: Record<string, string> = {
  plumbing: 'drop', electrical: 'lightning', lift: 'elevator', housekeeping: 'broom', security: 'shield-check', other: 'dots-three-circle',
};
