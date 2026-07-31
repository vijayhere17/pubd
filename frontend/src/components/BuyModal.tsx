import { useMemo, useState } from 'react'
import { useWallet } from '../hooks/useWallet'
import { approveUsdt, buyTokens, getContracts } from '../lib/contracts'
import { recordBuy, type DashboardData } from '../lib/api'
import { useToast } from '../store/toast'

type Props = {
  open: boolean
  onClose: () => void
  dashboard: DashboardData
  onSuccess: (next: DashboardData) => void
}

export function BuyModal({ open, onClose, dashboard, onSuccess }: Props) {
  const { getSigner, ensureBsc } = useWallet()
  const toast = useToast()
  const [usdtAmount, setUsdtAmount] = useState('')
  const [approved, setApproved] = useState(false)
  const [loading, setLoading] = useState(false)
  const price = dashboard.token_price || 0.1
  const receive = useMemo(() => {
    const n = Number(usdtAmount)
    if (!n || !price) return 0
    return n / price
  }, [usdtAmount, price])

  if (!open) return null

  const settings = dashboard.settings

  async function handleApprove() {
    if (!usdtAmount || Number(usdtAmount) <= 0) {
      toast.push('Enter a valid USDT amount', 'error')
      return
    }
    if (!settings.usdt_address || !settings.sale_address) {
      toast.push('First deploy contracts, then Admin → Settings → paste USDT + Sale + Token addresses and Save. You need PAB-D from Buy before Stake.', 'error')
      return
    }
    setLoading(true)
    try {
      await ensureBsc()
      const signer = await getSigner()
      const { usdt } = getContracts(signer, {
        usdt: settings.usdt_address,
        sale: settings.sale_address,
      })
      if (!usdt) throw new Error('USDT contract missing')
      await approveUsdt(usdt, settings.sale_address!, usdtAmount)
      setApproved(true)
      toast.push('USDT approved', 'success')
    } catch (e) {
      toast.push((e as Error).message || 'Approve failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleBuy() {
    if (!settings.sale_address) {
      toast.push('Sale contract not configured', 'error')
      return
    }
    setLoading(true)
    try {
      await ensureBsc()
      const signer = await getSigner()
      const { sale } = getContracts(signer, { sale: settings.sale_address })
      if (!sale) throw new Error('Sale contract missing')
      const { hash, blockNumber } = await buyTokens(sale, usdtAmount)
      const res = await recordBuy({
        usdt_amount: Number(usdtAmount),
        token_amount: receive,
        token_price: price,
        tx_hash: hash,
        block_number: blockNumber,
        confirmations: 1,
        status: 'confirmed',
      })
      toast.push('Transaction Successful', 'success')
      onSuccess(res.dashboard)
      onClose()
    } catch (e) {
      toast.push((e as Error).message || 'Buy failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass animate-fade-up w-full max-w-lg rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-[#f6e3aa]">Buy PAB-D</h2>
          <button onClick={onClose} className="text-[#7c879f]">✕</button>
        </div>
        <p className="mb-5 text-[#b9c2d6]">1 PAB-D = ${price.toFixed(2)}</p>
        <label className="mb-2 block text-sm text-[#7c879f]">USDT Amount</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={usdtAmount}
          onChange={(e) => { setUsdtAmount(e.target.value); setApproved(false) }}
          className="mb-4 w-full rounded-xl border border-[rgba(217,169,79,0.25)] bg-[#040914] px-4 py-3 outline-none focus:border-[#d9a94f]"
          placeholder="0.00"
        />
        <div className="mb-6 flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3">
          <span className="text-[#7c879f]">You Receive</span>
          <b className="text-[#f6e3aa]">{receive.toLocaleString(undefined, { maximumFractionDigits: 4 })} PAB-D</b>
        </div>
        <button
          disabled={loading}
          onClick={approved ? handleBuy : handleApprove}
          className="w-full rounded-xl bg-gradient-to-r from-[#d9a94f] to-[#b3812c] px-4 py-3 font-semibold text-[#0a1226] disabled:opacity-60"
        >
          {loading ? 'Processing…' : approved ? 'Buy Now' : 'Approve USDT'}
        </button>
      </div>
    </div>
  )
}
