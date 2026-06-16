import { Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Table from './screens/Table'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/vs" element={<Table />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
