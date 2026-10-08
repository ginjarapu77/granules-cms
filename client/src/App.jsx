import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Library from './pages/Library'
import { PageEditor, Pages } from './pages/Pages'
import Shell from './shell'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/documents" element={<Library />} />
          <Route path="/pages" element={<Pages />} />
          <Route path="/pages/:slug" element={<PageEditor />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
