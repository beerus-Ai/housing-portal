import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { pageAllowed } from '../nav';
import { Splash } from '../components/Splash';

/** Signed-in users only. Others go to /login and return afterwards. */
export function RequireAuth() {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

/** Signed-out users only (login page). */
export function GuestOnly() {
  const { me, loading } = useAuth();
  if (loading) return <Splash />;
  if (me) return <Navigate to={me.role === 'guard' ? '/gate' : '/'} replace />;
  return <Outlet />;
}

/** Role / permission / feature gate for a route. */
export function RequireRole({ role, page, children }: { role?: 'admin' | 'resident' | 'guard'; page?: string; children: JSX.Element }) {
  const { me } = useAuth();
  if (!me) return null;
  if (role && me.role !== role) return <Navigate to="/" replace />;
  if (page && !pageAllowed(me, page)) return <Navigate to="/" replace />;
  return children;
}
