import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Table from './screens/Table'
import History from './screens/History'
import OnlineTable from './screens/OnlineTable'
import Profile from './screens/Profile'

// interni admin dashboard — lazy da ne ulazi u bundle za igrače
const Admin = lazy(() => import('./screens/admin/Admin'))
const AdminGame = lazy(() => import('./screens/admin/AdminGame'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/vs" element={<Table />} />
      <Route path="/o/:code" element={<OnlineTable />} />
      <Route path="/profil" element={<Profile />} />
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
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
