import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, GuestOnly, RequireRole } from './auth/guards';
import { useAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { Splash } from './components/Splash';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Menu from './pages/Menu';
import Emergency from './pages/Emergency';
import Contacts from './pages/Contacts';
import GatePass from './pages/GatePass';
import Gate, { GateLog } from './pages/Gate';
import Vehicles from './pages/Vehicles';
import Parking from './pages/Parking';
import Workers from './pages/Workers';
import { Alerts, Approvals, ComingSoon, NotFound } from './pages/Misc';

const Settings = lazy(() => import('./pages/Settings'));

function Index() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role === 'admin') return <Dashboard />;
  if (me.role === 'guard') return <Navigate to="/gate" replace />;
  return <Home />;
}

const LATER = ['requests', 'raise', 'household', 'lease', 'notices', 'leases', 'vendors', 'audit', 'profile'];

const MINE: [string, JSX.Element][] = [
  ['emergency', <Emergency />], ['emergencies', <Emergency />], ['contacts', <Contacts />], ['gatepass', <GatePass />], ['gate', <Gate />],
  ['vehicles', <Vehicles />], ['parking', <Parking />],
];

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
          <Route path="menu" element={<Menu />} />
          <Route path="gatelog" element={<RequireRole page="gate"><GateLog /></RequireRole>} />
          <Route path="workers" element={<RequireRole role="admin"><Workers /></RequireRole>} />
          {MINE.map(([p, el]) => <Route key={p} path={p} element={<RequireRole page={p}>{el}</RequireRole>} />)}
          {LATER.map((p) => <Route key={p} path={p} element={<RequireRole page={p}><ComingSoon /></RequireRole>} />)}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
