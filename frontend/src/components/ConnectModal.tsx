type Props = {
  open: boolean
  onClose: () => void
  onMetaMask: () => void
  onTrustWallet: () => void
  onWalletConnect: () => void
  connecting: boolean
}

export function ConnectModal({
  open,
  onClose,
  onMetaMask,
  onTrustWallet,
  onWalletConnect,
  connecting,
}: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass animate-fade-up w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#f6e3aa]">Connect Wallet</h2>
            <p className="mt-1 text-sm text-[#b9c2d6]">BNB Smart Chain · MetaMask, Trust Wallet & more</p>
          </div>
          <button className="text-[#7c879f] hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-3">
          <button
            disabled={connecting}
            onClick={onMetaMask}
            className="w-full rounded-xl border border-[rgba(217,169,79,0.35)] bg-gradient-to-r from-[#d9a94f] to-[#b3812c] px-4 py-3 font-semibold text-[#0a1226] transition hover:brightness-110 disabled:opacity-60"
          >
            {connecting ? 'Connecting…' : 'MetaMask'}
          </button>
          <button
            disabled={connecting}
            onClick={onTrustWallet}
            className="w-full rounded-xl border border-[#3375BB]/50 bg-[#0b1c3d] px-4 py-3 font-semibold text-[#eef2fa] transition hover:bg-[#13284f] disabled:opacity-60"
          >
            Trust Wallet
          </button>
          <button
            disabled={connecting}
            onClick={onWalletConnect}
            className="w-full rounded-xl border border-[rgba(61,100,184,0.45)] bg-[#16294f] px-4 py-3 font-semibold text-[#eef2fa] transition hover:bg-[#1d3563] disabled:opacity-60"
          >
            WalletConnect (all wallets)
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#7c879f]">
          Trust Wallet mobile and other wallets use WalletConnect QR.
          Set <code className="text-[#b9c2d6]">VITE_WC_PROJECT_ID</code> in frontend/.env.
        </p>
      </div>
    </div>
  )
}
