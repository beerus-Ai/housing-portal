import { useQuery } from '@tanstack/react-query';
import { API } from '../api';
import { Icon } from '../components/Icon';
import { ago, parseTs } from '../components/format';
import { ErrorBanner } from '../components/ui';

export default function Audit() {
  const list = useQuery({ queryKey: ['audit'], queryFn: API.admin.audit });
  return (
    <div className="page">
      <div className="rail-head">
        <h1 className="hero-title">Audit trail</h1>
        <a href={API.admin.exportUrl} download className="btn btn-primary"><Icon name="download-simple" /> Export CSV</a>
      </div>
      <p className="muted">Latest 200 changes. The export lists every request.</p>
      <ErrorBanner error={list.error} />
      {list.data && list.data.length === 0 && <div className="card empty"><Icon name="clock-counter-clockwise" /><h2>Nothing recorded yet</h2></div>}
      <ul className="list">
        {(list.data ?? []).map((a) => (
          <li key={a.id} className="card row-card">
            <div>
              <b>{a.actor ?? 'System'}</b> {a.action.replace('_', ' ')} <span className="muted">{a.entity}{a.entity_id != null ? ` #${a.entity_id}` : ''}</span>
              {a.detail && <div className="muted small">{a.detail}</div>}
            </div>
            <time className="muted small" dateTime={parseTs(a.created_at).toISOString()}>{ago(a.created_at)}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
