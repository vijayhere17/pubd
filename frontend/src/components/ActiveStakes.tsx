import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '../hooks/useWallet'
import { getContracts, unstakeTokens } from '../lib/contracts'
import { recordClaim, type DashboardData, type StakeRow } from '../lib/api'
import { useToast } from '../store/toast'

type Props = {
  dashboard: DashboardData
  onSuccess: (next: DashboardData) => void
}

function formatRemaining(ms: number) {
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Ready to claim' }
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  return {
    days,
    hours,
    minutes,
    seconds,
    label: `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`,
  }
}

function StakeCard({
  stake,
  claimingId,
  onClaim,
}: {
  stake: StakeRow
  claimingId: number | null
  onClaim: (stake: StakeRow) => void
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const endMs = stake.ends_at ? new Date(stake.ends_at).getTime() : 0
  const remaining = formatRemaining(endMs - now)
  const claimable = Boolean(stake.claimable || (endMs > 0 && now >= endMs))
  const progress = useMemo(() => {
    if (!stake.starts_at || !stake.ends_at) return 0
    const start = new Date(stake.starts_at).getTime()
    const end = new Date(stake.ends_at).getTime()
    if (end <= start) return 100
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
  }, [stake.starts_at, stake.ends_at, now])

  return (
    <article className="dash-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Active Stake</div>
          <div className="mt-1 text-xl font-semibold text-[#f0d48a]">
            {Number(stake.amount).toLocaleString()} PAB-D
          </div>
          <div className="mt-1 text-sm text-[#b9c2d6]">
            {stake.lock_days} Days · {stake.bonus_percent}% Bonus
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">You will receive</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {Number(stake.total_return).toLocaleString()} PAB-D
          </div>
          <div className="text-xs text-[#7f8aa5]">
            +{Number(stake.estimated_reward).toLocaleString()} bonus
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[#7f8aa5]">Unlock timer</span>
        <b className={claimable ? 'text-emerald-300' : 'text-[#9db7ff]'}>{remaining.label}</b>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#3d64b8] to-[#d9a94f] transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-xs text-[#7f8aa5]">
        <div>
          Started
          <div className="mt-1 text-sm text-[#eef2fa]">
            {stake.starts_at ? new Date(stake.starts_at).toLocaleString() : '—'}
          </div>
        </div>
        <div>
          Unlocks
          <div className="mt-1 text-sm text-[#eef2fa]">
            {stake.ends_at ? new Date(stake.ends_at).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <button
        disabled={!claimable || claimingId === stake.id}
        onClick={() => onClaim(stake)}
        className={`w-full rounded-xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          claimable
            ? 'bg-gradient-to-r from-[#d9a94f] to-[#b3812c] text-[#0a1226]'
            : 'border border-white/10 bg-white/5 text-[#7f8aa5]'
        }`}
      >
        {claimingId === stake.id
          ? 'Claiming…'
          : claimable
            ? `Claim ${Number(stake.total_return).toLocaleString()} PAB-D`
            : `Claim after ${stake.lock_days} days`}
      </button>
    </article>
  )
}

export function ActiveStakes({ dashboard, onSuccess }: Props) {
  const { getSigner, ensureBsc, address, provider } = useWallet()
  const toast = useToast()
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const stakes = dashboard.stakes || []

  async function resolveOnchainId(stake: StakeRow): Promise<number> {
    if (stake.onchain_stake_id) return Number(stake.onchain_stake_id)
    const stakingAddress = dashboard.settings.staking_address
    if (!provider || !address || !stakingAddress) {
      throw new Error('Staking contract not configured')
    }
    const { staking } = getContracts(provider, { staking: stakingAddress })
    if (!staking) throw new Error('Staking contract missing')
    const ids: bigint[] = await staking.getUserStakeIds(address)
    if (!ids.length) throw new Error('No on-chain stake found for this wallet')
    // Prefer the newest stake id when DB mapping is missing
    return Number(ids[ids.length - 1])
  }

  async function handleClaim(stake: StakeRow) {
    const stakingAddress = dashboard.settings.staking_address
    if (!stakingAddress) {
      toast.push('Staking contract not configured', 'error')
      return
    }
    setClaimingId(stake.id)
    try {
      await ensureBsc()
      const onchainId = await resolveOnchainId(stake)
      const signer = await getSigner()
      const { staking } = getContracts(signer, { staking: stakingAddress })
      if (!staking) throw new Error('Staking contract missing')
      const { hash } = await unstakeTokens(staking, onchainId)
      const res = await recordClaim({
        stake_id: stake.id,
        onchain_stake_id: onchainId,
        amount: stake.total_return,
        type: 'stake',
        tx_hash: hash,
      })
      toast.push(`Claimed ${Number(stake.total_return).toLocaleString()} PAB-D`, 'success')
      onSuccess(res.dashboard)
    } catch (e) {
      toast.push((e as Error).message || 'Claim failed', 'error')
    } finally {
      setClaimingId(null)
    }
  }

  if (!stakes.length) {
    return (
      <section className="mb-6" id="claim">
        <article className="dash-card animate-fade-up p-5">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Claim Staked Tokens</div>
          <p className="text-sm text-[#b9c2d6]">
            After you stake, your lock timer and Claim button will appear here.
          </p>
        </article>
      </section>
    )
  }

  return (
    <section className="mb-6 space-y-4" id="claim">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Claim Staked Tokens</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Active Stakes & Unlock Timer</h2>
        </div>
        <div className="text-sm text-[#7f8aa5]">
          Claimable now:{' '}
          <b className="text-[#f0d48a]">{Number(dashboard.claimable_tokens || 0).toLocaleString()} PAB-D</b>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {stakes.map((stake) => (
          <StakeCard
            key={stake.id}
            stake={stake}
            claimingId={claimingId}
            onClaim={handleClaim}
          />
        ))}
      </div>
    </section>
  )
}
