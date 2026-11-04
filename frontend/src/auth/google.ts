// Lazy-loads Google Identity Services only when a client ID is configured and the user asks for it.
interface GsiId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

let loading: Promise<GsiId> | null = null;

export function loadGoogle(): Promise<GsiId> {
  if (window.google) return Promise.resolve(window.google.accounts.id);
  loading ??= new Promise<GsiId>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in failed to load')));
    s.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in could not be loaded'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
