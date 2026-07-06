import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Table from './screens/Table'
import History from './screens/History'
import OnlineTable from './screens/OnlineTable'

// interni admin dashboard — lazy da ne ulazi u bundle za igrače
const Admin = lazy(() => import('./screens/admin/Admin'))
const AdminGame = lazy(() => import('./screens/admin/AdminGame'))
// PRIVREMENI dev pregled priključivanja više igrača (samo `pnpm dev`)
const DevMulti = lazy(() => import('./screens/DevMulti'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/vs" element={<Table />} />
      <Route path="/o/:code" element={<OnlineTable />} />
      <Route path="/history" element={<History />} />
      <Route path="/history/:id" element={<History />} />
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
      {import.meta.env.DEV && (
        <Route
          path="/dev/multi"
          element={
            <Suspense fallback={null}>
              <DevMulti />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
