import { Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Table from './screens/Table'
import History from './screens/History'
import OnlineTable from './screens/OnlineTable'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/vs" element={<Table />} />
      <Route path="/o/:code" element={<OnlineTable />} />
      <Route path="/history" element={<History />} />
      <Route path="/history/:id" element={<History />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
