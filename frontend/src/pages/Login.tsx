import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API, type ResidentType } from '../api';
import { useAuth } from '../auth/AuthContext';
import { loadGoogle } from '../auth/google';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';

const TYPES: { key: ResidentType; label: string; icon: string }[] = [
  { key: 'owner', label: 'Owner', icon: 'key' },
  { key: 'tenant', label: 'Tenant', icon: 'house-line' },
  { key: 'family', label: 'Family', icon: 'users-three' },
];

function PasswordField({ id, label, value, onChange, autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)} required />
        <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
          onClick={() => setShow((s) => !s)}>
          <Icon name={show ? 'eye-slash' : 'eye'} />
        </button>
      </div>
    </div>
  );
}

function GoogleButton({ clientId, onCredential, onError }: {
  clientId: string; onCredential: (c: string) => void; onError: (m: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const start = async () => {
    try {
      const gsi = await loadGoogle();
      gsi.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
      if (host.current) {
        gsi.renderButton(host.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
        setRendered(true);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Google sign-in failed');
    }
  };
  return (
    <>
      {!rendered && (
        <button type="button" className="btn btn-ghost btn-block" onClick={start}>
          <Icon name="google-logo" /> Continue with Google
        </button>
      )}
      <div ref={host} className="google-host" />
    </>
  );
}

export default function Login() {
  const { login, loginWithGoogle, settings } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<'login' | 'join'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [notice, setNotice] = useState('');

  const [j, setJ] = useState({ resident_type: 'owner' as ResidentType, name: '', flat: '', phone: '', email: '', password: '', consent: false });

  useEffect(() => { setError(''); }, [mode]);

  const fail = (m: string) => { setError(m); setShaking(true); };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      nav(from, { replace: true });
    } catch (x) {
      fail(x instanceof Error ? x.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await API.auth.register({ ...j, name: j.name.trim(), flat: j.flat.trim(), phone: j.phone.trim(), email: j.email.trim() });
      setNotice(r.message);
      setMode('login');
      setEmail(j.email.trim());
      setPassword('');
    } catch (x) {
      fail(x instanceof Error ? x.message : 'Could not register');
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async (credential: string) => {
    try {
      await loginWithGoogle(credential);
      nav(from, { replace: true });
    } catch (x) {
      fail(x instanceof Error ? x.message : 'Google sign-in failed');
    }
  };

  const setJ1 = <K extends keyof typeof j>(k: K, v: (typeof j)[K]) => setJ((p) => ({ ...p, [k]: v }));
  const clientId = settings?.google_client_id ?? '';

  return (
    <main className="auth-page">
      <section className={`card auth-card ${shaking ? 'shake' : ''}`} onAnimationEnd={() => setShaking(false)} aria-labelledby="auth-title">
        <Logo size={64} />
        {mode === 'login' ? (
          <>
            <h1 id="auth-title">Welcome back</h1>
            {settings && <p className="muted">{settings.society_name}</p>}
            {notice && <p className="banner ok" role="status">{notice}</p>}
            <form onSubmit={submitLogin} className="stack" noValidate>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
              {error && <p className="banner err" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy} aria-busy={busy}>
                {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : 'Sign in'}
              </button>
            </form>
            {clientId && <GoogleButton clientId={clientId} onCredential={onGoogle} onError={fail} />}
            <p className="small">New here? <button type="button" className="link" onClick={() => { setNotice(''); setMode('join'); }}>Join</button></p>
            <p className="small"><a href="/app/sahyadri-heights.apk" download>Get the Android app</a></p>
          </>
        ) : (
          <>
            <h1 id="auth-title">Join your society</h1>
            <form onSubmit={submitJoin} className="stack" noValidate>
              <div className="tiles" role="radiogroup" aria-label="I am">
                {TYPES.map((t) => (
                  <button key={t.key} type="button" role="radio" aria-checked={j.resident_type === t.key}
                    className={`tile ${j.resident_type === t.key ? 'on' : ''}`} onClick={() => setJ1('resident_type', t.key)}>
                    <Icon name={t.icon} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="field"><label htmlFor="j-name">Full name</label>
                <input id="j-name" value={j.name} onChange={(e) => setJ1('name', e.target.value)} autoComplete="name" required /></div>
              <div className="row2">
                <div className="field"><label htmlFor="j-flat">Flat</label>
                  <input id="j-flat" value={j.flat} onChange={(e) => setJ1('flat', e.target.value)} required /></div>
                <div className="field"><label htmlFor="j-phone">Mobile</label>
                  <input id="j-phone" type="tel" value={j.phone} onChange={(e) => setJ1('phone', e.target.value)} autoComplete="tel" /></div>
              </div>
              <div className="field"><label htmlFor="j-email">Email</label>
                <input id="j-email" type="email" value={j.email} onChange={(e) => setJ1('email', e.target.value)} autoComplete="email" required /></div>
              <PasswordField id="j-password" label="Password (8+ characters)" value={j.password} onChange={(v) => setJ1('password', v)} autoComplete="new-password" />
              <label className="check">
                <input type="checkbox" checked={j.consent} onChange={(e) => setJ1('consent', e.target.checked)} />
                <span>I agree to my details being used to run the society</span>
              </label>
              {error && <p className="banner err" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy} aria-busy={busy}>
                {busy ? <><span className="spinner" aria-hidden="true" /> Sending…</> : 'Request access'}
              </button>
            </form>
            <p className="small">Already have an account? <button type="button" className="link" onClick={() => setMode('login')}>Sign in</button></p>
          </>
        )}
      </section>
    </main>
  );
}
