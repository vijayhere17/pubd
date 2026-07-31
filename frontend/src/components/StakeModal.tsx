import { useMemo, useState } from 'react'
import { useWallet } from '../hooks/useWallet'
import { getContracts, stakeTokens, parseUnits } from '../lib/contracts'
import { recordStake, type DashboardData } from '../lib/api'
import { useToast } from '../store/toast'
import { ERC20_ABI } from '../lib/config'
import { Contract } from 'ethers'

type LockPeriod = { days: number; percent?: number; apy?: number }

type Props = {
  open: boolean
  onClose: () => void
  dashboard: DashboardData
  /** On-chain wallet PAB-D balance (source of truth for staking) */
  walletPabd: number
  onSuccess: (next: DashboardData) => void
}

// PPT schedule (source of truth for UI)
const PPT_PERIODS: LockPeriod[] = [
  { days: 100, percent: 8 },
  { days: 200, percent: 20 },
  { days: 300, percent: 30 },
  { days: 400, percent: 45 },
  { days: 500, percent: 60 },
]

function periodPercent(p?: LockPeriod) {
  if (!p) return 0
  const ppt = PPT_PERIODS.find((x) => x.days === p.days)
  if (ppt) return ppt.percent!
  return Number(p.percent ?? p.apy ?? 0)
}

export function StakeModal({ open, onClose, dashboard, walletPabd, onSuccess }: Props) {
  const { getSigner, ensureBsc } = useWallet()
  const toast = useToast()
  const periods = PPT_PERIODS
  const [amount, setAmount] = useState('')
  const [lockDays, setLockDays] = useState(100)
  const [loading, setLoading] = useState(false)
  // Stake from wallet balance (on-chain), not Laravel purchase ledger
  const available = Math.max(0, Number(walletPabd) || 0)
  const minStake = Number(dashboard.settings.min_stake ?? 5000)
  const selected = periods.find((p) => p.days === lockDays)
  const bonusPercent = periodPercent(selected)

  const stakeAmount = Number(amount) || 0
  const reward = useMemo(() => stakeAmount * (bonusPercent / 100), [stakeAmount, bonusPercent])
  const totalReturn = stakeAmount + reward

  if (!open) return null

  async function handleStake() {
    const n = Number(amount)
    if (!n || n > available) {
      toast.push('Enter an amount within your wallet PAB-D balance', 'error')
      return
    }
    if (n < minStake) {
      toast.push(`Minimum stake is ${minStake.toLocaleString()} PAB-D.`, 'error')
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
      const { hash, stakeId } = await stakeTokens(staking, amount, lockDays)
      const res = await recordStake({
        amount: n,
        lock_days: lockDays,
        apy: bonusPercent,
        onchain_stake_id: stakeId ?? undefined,
        tx_hash: hash,
      })
      toast.push(`Staked! You will claim ${totalReturn.toLocaleString()} PAB-D after ${lockDays} days.`, 'success')
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
        <p className="mb-1 text-[#b9c2d6]">Staking is in <b className="text-[#f0d48a]">PAB-D</b> only.</p>
        <p className="mb-1 text-sm text-[#7c879f]">Wallet balance: {available.toLocaleString()} PAB-D</p>
        <p className="mb-5 text-sm text-[#f0d48a]">Minimum stake: {minStake.toLocaleString()} PAB-D</p>

        <label className="mb-2 block text-sm text-[#7c879f]">Stake Amount (PAB-D)</label>
        <input
          type="number"
          min={minStake}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-4 w-full rounded-xl border border-[rgba(217,169,79,0.25)] bg-[#040914] px-4 py-3 outline-none focus:border-[#d9a94f]"
          placeholder={String(minStake)}
        />

        <label className="mb-2 block text-sm text-[#7c879f]">Lock Period</label>
        <select
          value={lockDays}
          onChange={(e) => setLockDays(Number(e.target.value))}
          className="mb-4 w-full rounded-xl border border-[rgba(217,169,79,0.25)] bg-[#040914] px-4 py-3 outline-none"
        >
          {periods.map((p) => (
            <option key={p.days} value={p.days}>
              {p.days} Days · {periodPercent(p)}% Bonus
            </option>
          ))}
        </select>

        <div className="mb-3 space-y-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[#7c879f]">Bonus</span>
            <b className="text-[#f6e3aa]">{bonusPercent}% → {reward.toLocaleString(undefined, { maximumFractionDigits: 4 })} PAB-D</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#7c879f]">You will receive</span>
            <b className="text-xl text-[#f6e3aa]">{totalReturn.toLocaleString(undefined, { maximumFractionDigits: 4 })} PAB-D</b>
          </div>
          <p className="text-xs text-[#7c879f]">Shown instantly. Claimable only after {lockDays} days.</p>
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
