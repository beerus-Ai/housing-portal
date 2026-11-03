import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, GuestOnly, RequireRole } from './auth/guards';
import { useAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { Splash } from './components/Splash';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import { Alerts, Approvals, ComingSoon, NotFound } from './pages/Misc';

const Settings = lazy(() => import('./pages/Settings'));

function Index() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role === 'admin') return <Dashboard />;
  if (me.role === 'guard') return <Navigate to="/gate" replace />;
  return <Home />;
}

const LATER = ['requests', 'raise', 'household', 'contacts', 'gatepass', 'emergency', 'lease', 'notices', 'emergencies', 'leases', 'vendors', 'gate', 'gatelog', 'audit'];

export function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Index />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="approvals" element={<RequireRole role="admin"><Approvals /></RequireRole>} />
          <Route path="settings" element={
            <RequireRole role="admin">
              <Suspense fallback={<Splash />}><Settings /></Suspense>
            </RequireRole>
          } />
          {LATER.map((p) => <Route key={p} path={p} element={<RequireRole page={p}><ComingSoon /></RequireRole>} />)}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
