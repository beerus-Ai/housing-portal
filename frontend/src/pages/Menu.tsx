import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { navSections, PROFILE_ITEM } from '../nav';
import { useIsPhone } from '../components/Shell';

/** Phone Menu screen: every page the person can use, in the four sections, plus profile and sign out. */
export default function Menu() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const phone = useIsPhone();
  if (!me) return null;
  if (!phone) return <Navigate to="/" replace />;
  const { sections } = navSections(me);
  const account = [PROFILE_ITEM, ...(me.role === 'admin' ? [{ key: 'alerts', path: '/alerts', label: 'Alerts', icon: 'bell', sub: 'Your notifications' }] : [])];
  return (
    <div className="page">
      <h1 className="hero-title">Menu</h1>
      {sections.map((s) => (
        <section key={s.title} className="rail" aria-label={s.title}>
          <h2>{s.title}</h2>
          <div className="menu-grid">
            {s.items.map((i) => (
              <Link key={i.key} to={i.path} className="menu-card">
                <span className="menu-ic"><Icon name={i.icon} /></span>
                <b>{i.label}</b>
                {i.sub && <span className="muted small">{i.sub}</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <section className="rail" aria-label="Account">
        <h2>Account</h2>
        <div className="menu-grid">
          {account.map((i) => (
            <Link key={i.key} to={i.path} className="menu-card">
              <span className="menu-ic"><Icon name={i.icon} /></span>
              <b>{i.label}</b>
              {i.sub && <span className="muted small">{i.sub}</span>}
            </Link>
          ))}
        </div>
      </section>
      <button type="button" className="btn btn-ghost btn-lg" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>
        <Icon name="sign-out" /> Sign out
      </button>
    </div>
  );
}
