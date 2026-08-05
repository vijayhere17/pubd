import { useMemo, useState } from 'react'
import { JsonRpcProvider } from 'ethers'
import { useWallet } from '../hooks/useWallet'
import { assertStakingReady, getContracts, stakeTokens, parseUnits } from '../lib/contracts'
import { recordStake, type DashboardData } from '../lib/api'
import { useToast } from '../store/toast'
import { ERC20_ABI, rpcUrlForChain } from '../lib/config'
import { Contract } from 'ethers'

type LockPeriod = { days: number; percent?: number; apy?: number }
type StakeUnit = 'usd' | 'pabd'

type Props = {
  open: boolean
  onClose: () => void
  dashboard: DashboardData
  walletPabd: number
  onSuccess: (next: DashboardData) => void
}

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

function fmtUsd(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

function fmtPabd(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

/** Trim float noise for parseUnits (max 8 dp is enough for UX). */
function pabdAmountString(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0'
  return n.toFixed(8).replace(/\.?0+$/, '')
}

export function StakeModal({ open, onClose, dashboard, walletPabd, onSuccess }: Props) {
  const { getSigner, ensureBsc } = useWallet()
  const toast = useToast()
  const periods = PPT_PERIODS
  const [unit, setUnit] = useState<StakeUnit>('usd')
  const [amount, setAmount] = useState('')
  const [lockDays, setLockDays] = useState(100)
  const [loading, setLoading] = useState(false)

  const available = Math.max(0, Number(walletPabd) || 0)
  const price = Number(dashboard.token_price || 0.1)
  const minStakeUsd = Number(dashboard.settings.min_stake_usd ?? 500)
  const minStakePabd = Number(
    dashboard.settings.min_stake ?? (price > 0 ? minStakeUsd / price : 5000),
  )
  const selected = periods.find((p) => p.days === lockDays)
  const bonusPercent = periodPercent(selected)

  const raw = Number(amount) || 0
  const stakeAmount = useMemo(() => {
    if (unit === 'pabd') return raw
    return price > 0 ? raw / price : 0
  }, [unit, raw, price])
  const stakeUsd = stakeAmount * price
  const availableUsd = available * price
  const reward = stakeAmount * (bonusPercent / 100)
  const rewardUsd = reward * price
  const totalReturn = stakeAmount + reward
  const totalReturnUsd = totalReturn * price

  if (!open) return null

  function switchUnit(next: StakeUnit) {
    if (next === unit) return
    const n = Number(amount)
    if (n > 0 && price > 0) {
      if (next === 'usd') setAmount(pabdAmountString(n * price))
      else setAmount(pabdAmountString(n / price))
    }
    setUnit(next)
  }

  async function handleStake() {
    const n = stakeAmount
    if (!n || n > available + 1e-8) {
      toast.push('Enter an amount within your wallet PAB-D balance', 'error')
      return
    }
    if (stakeUsd + 1e-8 < minStakeUsd || n + 1e-8 < minStakePabd) {
      toast.push(
        `Minimum stake is $${fmtUsd(minStakeUsd)} (≈ ${fmtPabd(minStakePabd)} PAB-D).`,
        'error',
      )
      return
    }
    const { token_address, staking_address } = dashboard.settings
    if (!token_address || !staking_address) {
      toast.push('Staking contracts not configured by admin yet', 'error')
      return
    }

    const pabdStr = pabdAmountString(n)
    setLoading(true)
    try {
      await ensureBsc()
      const signer = await getSigner()
      const chainId = Number(dashboard.settings.chain_id || 56)
      const readProvider = new JsonRpcProvider(rpcUrlForChain(chainId), chainId)

      await assertStakingReady(readProvider, staking_address, token_address, pabdStr, lockDays)

      const token = new Contract(token_address, ERC20_ABI, signer)
      const value = parseUnits(pabdStr, 18)
      const approveTx = await token.approve(staking_address, value)
      await approveTx.wait()
      const { staking } = getContracts(signer, { staking: staking_address })
      if (!staking) throw new Error('Staking contract missing')
      const { hash, stakeId } = await stakeTokens(staking, pabdStr, lockDays)
      const res = await recordStake({
        amount: Number(pabdStr),
        lock_days: lockDays,
        apy: bonusPercent,
        onchain_stake_id: stakeId ?? undefined,
        tx_hash: hash,
      })
      toast.push(
        `Staked ${fmtPabd(Number(pabdStr))} PAB-D (≈ $${fmtUsd(stakeUsd)})! Claim ${fmtPabd(totalReturn)} after ${lockDays} days.`,
        'success',
      )
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

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => switchUnit('usd')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${unit === 'usd' ? 'bg-[#d9a94f] text-[#0a1226]' : 'text-[#b9c2d6]'}`}
          >
            Stake in $
          </button>
          <button
            type="button"
            onClick={() => switchUnit('pabd')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${unit === 'pabd' ? 'bg-[#d9a94f] text-[#0a1226]' : 'text-[#b9c2d6]'}`}
          >
            Stake in PAB-D
          </button>
        </div>

        <p className="mb-1 text-sm text-[#7c879f]">
          Price ${fmtUsd(price, 4)} · Wallet {fmtPabd(available)} PAB-D ≈ ${fmtUsd(availableUsd)}
        </p>
        <p className="mb-4 text-sm text-[#f0d48a]">
          Minimum ${fmtUsd(minStakeUsd)} ≈ {fmtPabd(minStakePabd)} PAB-D
        </p>

        <label className="mb-2 block text-sm text-[#7c879f]">
          {unit === 'usd' ? 'Stake Amount (USD)' : 'Stake Amount (PAB-D)'}
        </label>
        <input
          type="number"
          min={unit === 'usd' ? minStakeUsd : minStakePabd}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-1 w-full rounded-xl border border-[rgba(217,169,79,0.25)] bg-[#040914] px-4 py-3 outline-none focus:border-[#d9a94f]"
          placeholder={unit === 'usd' ? String(minStakeUsd) : String(minStakePabd)}
        />
        <p className="mb-4 text-xs text-[#7c879f]">
          {unit === 'usd'
            ? `≈ ${fmtPabd(stakeAmount)} PAB-D will be transferred`
            : `≈ $${fmtUsd(stakeUsd)} USD`}
        </p>

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
            <span className="text-[#7c879f]">You stake</span>
            <b className="text-[#f6e3aa]">{fmtPabd(stakeAmount)} PAB-D ≈ ${fmtUsd(stakeUsd)}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#7c879f]">Bonus {bonusPercent}%</span>
            <b className="text-[#f6e3aa]">{fmtPabd(reward)} PAB-D ≈ ${fmtUsd(rewardUsd)}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#7c879f]">You will receive</span>
            <b className="text-xl text-[#f6e3aa]">{fmtPabd(totalReturn)} PAB-D</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#7c879f]">≈ USD</span>
            <b className="text-[#f0d48a]">${fmtUsd(totalReturnUsd)}</b>
          </div>
          <p className="text-xs text-[#7c879f]">On-chain transfer is always PAB-D. Claim after {lockDays} days.</p>
        </div>

        <button
          disabled={loading}
          onClick={handleStake}
          className="w-full rounded-xl bg-gradient-to-r from-[#3d64b8] to-[#2c4a9c] px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Processing…' : unit === 'usd' ? `Stake $${fmtUsd(raw || minStakeUsd)}` : 'Stake Now'}
        </button>
      </div>
    </div>
  )
}
