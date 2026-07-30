import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastHost } from './components/ToastHost'
import { WalletProvider } from './hooks/useWallet'
import { Admin } from './pages/Admin'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Landing } from './pages/Landing'

export default function App() {
  return (
    <WalletProvider>
      <ToastHost />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </WalletProvider>
  )
}
