import { useMemo, useState } from 'react'
import { useWallet } from '../hooks/useWallet'
import { getContracts, stakeTokens, parseUnits } from '../lib/contracts'
import { recordStake, type DashboardData } from '../lib/api'
import { useToast } from '../store/toast'
import { ERC20_ABI } from '../lib/config'
import { Contract } from 'ethers'

type Props = {
  open: boolean
  onClose: () => void
  dashboard: DashboardData
  onSuccess: (next: DashboardData) => void
}

export function StakeModal({ open, onClose, dashboard, onSuccess }: Props) {
  const { getSigner, ensureBsc } = useWallet()
  const toast = useToast()
  const periods = dashboard.settings.lock_periods || [
    { days: 100, apy: 8 }, { days: 200, apy: 10 }, { days: 300, apy: 12 }, { days: 400, apy: 15 }, { days: 500, apy: 18 },
  ]
  const [amount, setAmount] = useState('')
  const [lockDays, setLockDays] = useState(periods[0]?.days || 100)
  const [loading, setLoading] = useState(false)
  const available = dashboard.available_tokens
  const apy = periods.find((p) => p.days === lockDays)?.apy || 12
  const reward = useMemo(() => {
    const n = Number(amount) || 0
    return n * (apy / 100) * (lockDays / 365)
  }, [amount, apy, lockDays])

  if (!open) return null

  async function handleStake() {
    const n = Number(amount)
    if (!n || n > available) {
      toast.push('Enter an amount within your available balance', 'error')
      return
    }
    const { token_address, staking_address } = dashboard.settings
    if (!token_address || !staking_address) {
      toast.push('Staking contracts not configured by admin yet', 'error')
      return
    }
    setLoading(true)
    try {
      await ensureBsc()
      const signer = await getSigner()
      const token = new Contract(token_address, ERC20_ABI, signer)
      const value = parseUnits(amount, 18)
      const approveTx = await token.approve(staking_address, value)
      await approveTx.wait()
      const { staking } = getContracts(signer, { staking: staking_address })
      if (!staking) throw new Error('Staking contract missing')
      const { hash } = await stakeTokens(staking, amount, lockDays)
      const res = await recordStake({
        amount: n,
        lock_days: lockDays,
        apy,
        tx_hash: hash,
      })
      toast.push('Transaction Successful', 'success')
      onSuccess(res.dashboard)
      onClose()
    } catch (e) {
      toast.push((e as Error).message || 'Stake failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass animate-fade-up w-full max-w-lg rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-[#f6e3aa]">Stake PAB-D</h2>
          <button onClick={onClose} className="text-[#7c879f]">✕</button>
        </div>
        <p className="mb-5 text-[#b9c2d6]">Available: {available.toLocaleString()} PAB-D</p>
        <label className="mb-2 block text-sm text-[#7c879f]">Stake Amount</label>
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-4 w-full rounded-xl border border-[rgba(217,169,79,0.25)] bg-[#040914] px-4 py-3 outline-none focus:border-[#d9a94f]"
        />
        <label className="mb-2 block text-sm text-[#7c879f]">Lock Period</label>
        <select
          value={lockDays}
          onChange={(e) => setLockDays(Number(e.target.value))}
          className="mb-4 w-full rounded-xl border border-[rgba(217,169,79,0.25)] bg-[#040914] px-4 py-3 outline-none"
        >
          {periods.map((p) => (
            <option key={p.days} value={p.days}>{p.days} Days · {p.apy}% APY</option>
          ))}
        </select>
        <div className="mb-6 flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3">
          <span className="text-[#7c879f]">Estimated reward</span>
          <b className="text-[#f6e3aa]">{reward.toLocaleString(undefined, { maximumFractionDigits: 4 })} PAB-D</b>
        </div>
        <button
          disabled={loading}
          onClick={handleStake}
          className="w-full rounded-xl bg-gradient-to-r from-[#3d64b8] to-[#2c4a9c] px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Processing…' : 'Stake Now'}
        </button>
      </div>
    </div>
  )
}
