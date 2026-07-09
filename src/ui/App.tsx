import { Suspense, lazy } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import Home from './screens/Home';
import Games from './screens/Games';
import History from './screens/History';
import OnlineTable from './screens/OnlineTable';
import Profile from './screens/Profile';
import Settings from './screens/Settings';
import PwaUpdateBanner from '../pwa/PwaUpdateBanner';
import { AppHeader } from './components/AppHeader';
import { TabBar } from './components/TabBar';

// interni admin dashboard — lazy da ne ulazi u bundle za igrače
const Admin = lazy(() => import('./screens/admin/Admin'));
const AdminGame = lazy(() => import('./screens/admin/AdminGame'));
const AdminPlayer = lazy(() => import('./screens/admin/AdminPlayer'));

/** Tab ekrani: desktop dobija plavi header sa linkovima, mobilni donji TabBar.
 *  Sto (/o/:code) i admin su van ovoga — imaju svoje trake. */
function TabLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <AppHeader />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}

export default function App() {
  return (
    <>
      <PwaUpdateBanner />
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/partije" element={<Games />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<History />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/podesavanja" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Route>
        <Route path="/o/:code" element={<OnlineTable />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
        <Route
          path="/admin/g/:code"
          element={
            <Suspense fallback={null}>
              <AdminGame />
            </Suspense>
          }
        />
        <Route
          path="/admin/p/:userId"
          element={
            <Suspense fallback={null}>
              <AdminPlayer />
            </Suspense>
          }
        />
      </Routes>
    </>
  );
}
