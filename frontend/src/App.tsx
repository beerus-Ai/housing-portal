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

import { RequestDetailPage, RequestList } from './pages/Requests';
import Raise from './pages/Raise';
import Notices from './pages/Notices';
import Household from './pages/Household';
import { Leases, MyLease } from './pages/Leases';
import Vendors from './pages/Vendors';
import Audit from './pages/Audit';
import Profile from './pages/Profile';

const Settings = lazy(() => import('./pages/Settings'));

function Index() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role === 'admin') return <Dashboard />;
  if (me.role === 'guard') return <Navigate to="/gate" replace />;
  return <Home />;
}

const LATER: string[] = []; // every menu page has a real screen now
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
          <Route path="requests" element={<RequireRole page="requests"><RequestList /></RequireRole>} />
          <Route path="requests/:id" element={<RequireRole page="requests"><RequestDetailPage /></RequireRole>} />
          <Route path="raise" element={<RequireRole page="raise"><Raise /></RequireRole>} />
          <Route path="notices" element={<RequireRole page="notices"><Notices /></RequireRole>} />
          <Route path="household" element={<RequireRole page="household"><Household /></RequireRole>} />
          <Route path="lease" element={<RequireRole page="lease"><MyLease /></RequireRole>} />
          <Route path="leases" element={<RequireRole role="admin"><Leases /></RequireRole>} />
          <Route path="vendors" element={<RequireRole role="admin"><Vendors /></RequireRole>} />
          <Route path="audit" element={<RequireRole role="admin"><Audit /></RequireRole>} />
          <Route path="profile" element={<Profile />} />
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
