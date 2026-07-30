import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConnectModal } from '../components/ConnectModal'
import { useWallet } from '../hooks/useWallet'

declare global {
  interface Window {
    PabdConnect?: () => Promise<void>
    PabdApp?: { connect: () => Promise<void> }
  }
}

export function Landing() {
  const navigate = useNavigate()
  const { connectMetaMask, connectWalletConnect, connecting, address } = useWallet()
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (address && localStorage.getItem('pabd_token')) {
      // Already authenticated sessions can jump straight to dashboard from landing connect
    }
  }, [address])

  useEffect(() => {
    const runConnect = async () => {
      setModalOpen(true)
    }
    window.PabdConnect = runConnect

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PABD_CONNECT') setModalOpen(true)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      delete window.PabdConnect
    }
  }, [])

  async function afterConnect(fn: () => Promise<string>) {
    try {
      await fn()
      setModalOpen(false)
      navigate('/dashboard')
    } catch {
      // toast handled in wallet hook
    }
  }

  return (
    <>
      <iframe
        title="PAB-D Landing"
        src="/landing.html"
        className="landing-frame"
      />
      <ConnectModal
        open={modalOpen}
        connecting={connecting}
        onClose={() => setModalOpen(false)}
        onMetaMask={() => afterConnect(connectMetaMask)}
        onWalletConnect={() => afterConnect(connectWalletConnect)}
      />
    </>
  )
}
