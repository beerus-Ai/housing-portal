import type { ReactNode } from 'react';

/** Bottom sheet / dialog with a dimmed backdrop. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="sheet-back" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </>
  );
}

/** Inline yes/no confirmation shown in place of a destructive button. */
export function InlineConfirm({ text, yes, no = 'Keep', onYes, onNo, busy }: { text: string; yes: string; no?: string; onYes: () => void; onNo: () => void; busy?: boolean }) {
  return (
    <div className="inline-confirm" role="alert">
      <b className="small">{text}</b>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onYes}>{yes}</button>
      <button type="button" className="btn btn-ghost" onClick={onNo}>{no}</button>
    </div>
  );
}
