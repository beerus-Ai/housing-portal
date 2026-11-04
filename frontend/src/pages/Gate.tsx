import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { API, type GateLogRow, type GateOverview, type GateVerifyResult } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { stamp } from '../components/format';

export const RESULT_CLEAR_MS = 8000;

const REASONS: Record<string, string> = {
  expired: 'This pass has expired.', used: 'This pass was already used.', cancelled: 'This pass was cancelled by the resident.',
  not_found: 'Code not recognised.', unknown: 'Code not recognised.', invalid: 'Code not recognised.',
  not_yet_valid: 'This pass is not valid yet.', inactive: 'This resident is not active.',
};
export const reasonText = (r?: string | null): string =>
  r ? REASONS[r] ?? r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Not allowed.';

interface Detector { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector;
const detectorCtor = (): DetectorCtor | undefined => (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
const canScan = () => !!(typeof navigator.mediaDevices?.getUserMedia === 'function' && detectorCtor());

function ResultCard({ r }: { r: GateVerifyResult }) {
  const ok = r.result === 'allowed';
  return (
    <div className={`gate-res ${ok ? 'ok' : 'no'}`} role="status" data-testid="gate-result">
      <b className="gate-big">{ok ? 'ALLOWED' : 'DENIED'}</b>
      {ok ? (
        <>
          <span className="gate-name">{r.name}</span>
          {r.flat && <span>Flat {r.flat}</span>}
          {r.purpose && <span>{r.purpose}</span>}
          {r.kind === 'resident' && <span>Resident</span>}
        </>
      ) : (
        <>
          <span className="gate-name">{reasonText(r.reason)}</span>
          {r.name && <span>{r.name}{r.flat ? `, Flat ${r.flat}` : ''}</span>}
        </>
      )}
    </div>
  );
}

/** Camera QR scanner using BarcodeDetector. Calls onToken once with the raw QR text, then stops. */
function Scanner({ onToken, onError }: { onToken: (t: string) => void; onError: (m: string) => void }) {
  const [on, setOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!on) return;
    let dead = false;
    let timer = 0;
    let stream: MediaStream | null = null;
    const stop = () => { dead = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (dead || !video.current) return stop();
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = detectorCtor();
        if (!Ctor) throw new Error('unsupported');
        const det = new Ctor({ formats: ['qr_code'] });
        const tick = async () => {
          if (dead || !video.current) return;
          try {
            const found = await det.detect(video.current);
            if (found[0]?.rawValue) { stop(); setOn(false); onToken(found[0].rawValue); return; }
          } catch { /* keep scanning */ }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        stop(); setOn(false); onError('Camera not available. Type the code instead.');
      }
    })();
    const vis = () => { if (document.hidden) { stop(); setOn(false); } };
    document.addEventListener('visibilitychange', vis);
    return () => { stop(); document.removeEventListener('visibilitychange', vis); };
  }, [on, onToken, onError]);
  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost btn-lg" onClick={() => setOn(!on)}><Icon name="scan" /> {on ? 'Stop scanning' : 'Scan QR'}</button>
      {on && <video ref={video} className="gate-cam" playsInline muted />}
    </div>
  );
}

function Guard() {
  const [code, setCode] = useState('');
  const [res, setRes] = useState<GateVerifyResult | null>(null);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const log = useQuery({ queryKey: ['gate-log'], queryFn: API.gate.log, refetchInterval: 15_000 });
  const verify = useMutation({
    mutationFn: (body: { code: string } | { token: string }) => API.gate.verify(body).catch((e: Error): GateVerifyResult => ({ result: 'denied', reason: e.message })),
    onSuccess: (r) => {
      setRes(r); setCode('');
      if (typeof navigator.vibrate === 'function') { try { navigator.vibrate(r.result === 'allowed' ? 150 : [120, 80, 120]); } catch { /* ignore */ } }
      void log.refetch();
    },
  });
  const { mutate } = verify;
  useEffect(() => {
    if (!res) return;
    const t = setTimeout(() => { setRes(null); input.current?.focus(); }, RESULT_CLEAR_MS);
    return () => clearTimeout(t);
  }, [res]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) { setErr('Enter the 6-digit code'); return; }
    setErr('');
    mutate({ code: digits });
  };
  const onToken = useCallback((t: string) => mutate({ token: t }), [mutate]);
  const rows = (log.data ?? []).slice(0, 8);
  return (
    <div className="page">
      <h1 className="hero-title">Gate</h1>
      <form className="stack" onSubmit={submit}>
        <label className="sr" htmlFor="gcode">6-digit code</label>
        <input id="gcode" ref={input} className="gate-code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" autoFocus
          placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        {err && <p className="banner err" role="alert">{err}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={verify.isPending}><Icon name="shield-check" /> Verify</button>
      </form>
      {canScan()
        ? <Scanner onToken={onToken} onError={setErr} />
        : <p className="muted small">QR scanning is not supported on this device. Type the 6-digit code instead.</p>}
      <div aria-live="assertive">{res && <ResultCard r={res} />}</div>
      <LogList rows={rows} title="Recent entries" empty="No entries yet." />
    </div>
  );
}

function LogList({ rows, title, empty }: { rows: GateLogRow[]; title: string; empty: string }) {
  return (
    <section className="rail" aria-label={title}>
      <div className="rail-head"><h2>{title}</h2></div>
      {rows.length === 0 && <p className="muted">{empty}</p>}
      <ul className="list">
        {rows.map((r) => {
          const ok = r.result === 'allowed';
          return (
            <li key={r.id} className="card log-row">
              <div className="row-card nopad">
                <b>{r.subject || 'Unknown'}</b>
                <span className={`pill ${ok ? 'st-approved' : 'st-suspended'}`}>{ok ? 'ALLOWED' : 'DENIED'}</span>
              </div>
              <span className="muted small">{stamp(r.created_at)}{r.flat ? ` · Flat ${r.flat}` : ''}{r.guard_name ? ` · ${r.guard_name}` : ''}</span>
              {!ok && r.reason && <span className="small">{reasonText(r.reason)}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function GateLog() {
  const log = useQuery({ queryKey: ['gate-log'], queryFn: API.gate.log, refetchInterval: 15_000 });
  return (
    <div className="page">
      <h1 className="hero-title">Gate log</h1>
      {log.error && <p className="banner err" role="alert">{log.error.message}</p>}
      <LogList rows={log.data ?? []} title="Latest entries" empty="No entries yet." />
    </div>
  );
}

function Stat({ n, label, tone }: { n: number | undefined; label: string; tone: string }) {
  return <div className={`card stat ${tone}`}><span>{label}</span><b>{n ?? 0}</b></div>;
}

export function ByHour({ rows }: { rows: GateOverview['by_hour'] }) {
  const hrs = Array.from({ length: 24 }, (_, h) => {
    const r = rows.find((x) => Number(x.hour) === h);
    return r ? Number(r.n) || 0 : 0;
  });
  const mx = Math.max(1, ...hrs);
  return (
    <div className="card" role="img" aria-label="Entries by hour of day">
      <h2>Entries by hour</h2>
      <div className="ov-chart">
        {hrs.map((n, h) => (
          <span key={h} className="ov-bar" title={`${h}:00 · ${n}`}>
            <i className="ov-fill" style={{ height: `${Math.round((n / mx) * 100)}%` }} />
            <em>{h % 6 === 0 ? h : ''}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function Overview() {
  const ov = useQuery({ queryKey: ['gate-overview'], queryFn: API.gate.overview, refetchInterval: 5000 });
  const o = ov.data;
  return (
    <div className="page">
      <h1 className="hero-title">Gate</h1>
      <p className="muted">Live overview, refreshes every few seconds.</p>
      {ov.error && <p className="banner err" role="alert">{ov.error.message}</p>}
      {o && (
        <>
          <div className="glance">
            <Stat n={o.today.allowed} label="Admitted today" tone="t-ink" />
            <Stat n={o.today.denied} label="Denied today" tone="t-sky" />
            <Stat n={o.today.visitors} label="Visitors" tone="" />
            <Stat n={o.today.residents} label="Residents" tone="" />
            <Stat n={o.active_passes} label="Active passes" tone="t-sky" />
            {o.inside != null && <Stat n={o.inside} label="Inside now" tone="" />}
          </div>
          <ByHour rows={o.by_hour} />
          <LogList rows={o.recent} title="Recent scans" empty="No scans yet today." />
        </>
      )}
    </div>
  );
}

export default function Gate() {
  const { me } = useAuth();
  return me?.role === 'admin' ? <Overview /> : <Guard />;
}
