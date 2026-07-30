import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BuyModal } from '../components/BuyModal'
import { StakeModal } from '../components/StakeModal'
import { StatCard } from '../components/StatCard'
import { useWallet } from '../hooks/useWallet'
import { claimVested, getContracts, readTokenBalance } from '../lib/contracts'
import { fetchDashboard, recordClaim, type DashboardData } from '../lib/api'
import { useToast } from '../store/toast'

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function fmt(n: number, d = 2) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d })
}

export function Dashboard() {
  const navigate = useNavigate()
  const { address, disconnect, getSigner, provider, ensureBsc } = useWallet()
  const toast = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [balances, setBalances] = useState({ bnb: 0, usdt: 0, pabd: 0 })
  const [loading, setLoading] = useState(true)
  const [buyOpen, setBuyOpen] = useState(false)
  const [stakeOpen, setStakeOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const refresh = useCallback(async () => {
    const dash = await fetchDashboard()
    setData(dash)
    return dash
  }, [])

  useEffect(() => {
    if (!address || !localStorage.getItem('pabd_token')) {
      navigate('/')
      return
    }
    refresh()
      .catch(() => {
        toast.push('Failed to load dashboard', 'error')
        navigate('/')
      })
      .finally(() => setLoading(false))
  }, [address, navigate, refresh, toast])

  useEffect(() => {
    async function loadBalances() {
      if (!provider || !address || !data) return
      try {
        const bnbWei = await provider.getBalance(address)
        const { usdt, token } = getContracts(provider, {
          usdt: data.settings.usdt_address,
          token: data.settings.token_address,
        })
        const [usdtBal, pabdBal] = await Promise.all([
          readTokenBalance(usdt, address),
          readTokenBalance(token, address),
        ])
        setBalances({
          bnb: Number(bnbWei) / 1e18,
          usdt: usdtBal,
          pabd: pabdBal,
        })
      } catch {
        // balances optional until contracts configured
      }
    }
    loadBalances()
  }, [provider, address, data])

  async function handleClaim() {
    if (!data || data.claimable_tokens <= 0) return
    if (!data.settings.vesting_address) {
      toast.push('Vesting contract not configured', 'error')
      return
    }
    setClaiming(true)
    try {
      await ensureBsc()
      const signer = await getSigner()
      const { vesting } = getContracts(signer, { vesting: data.settings.vesting_address })
      if (!vesting) throw new Error('Vesting missing')
      const { hash } = await claimVested(vesting)
      const res = await recordClaim({ amount: data.claimable_tokens, tx_hash: hash, type: 'vesting' })
      setData(res.dashboard)
      toast.push('Transaction Successful', 'success')
    } catch (e) {
      toast.push((e as Error).message || 'Claim failed', 'error')
    } finally {
      setClaiming(false)
    }
  }

  if (loading || !data || !address) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[#b9c2d6]">
        <div className="animate-glow glass rounded-2xl px-8 py-6">Loading dashboard…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div>
            <div className="text-sm tracking-[0.2em] text-[#d9a94f]">PAB-D DASHBOARD</div>
            <p className="text-[#7c879f]">Private sale & staking portal</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[rgba(217,169,79,0.3)] px-4 py-2 text-sm text-[#f6e3aa]">
              {short(address)}
            </span>
            <Link to="/history" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#b9c2d6] hover:border-[#d9a94f]/50">History</Link>
            {localStorage.getItem('pabd_is_admin') === '1' && (
              <Link to="/admin" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#b9c2d6]">Admin</Link>
            )}
            <button
              onClick={() => { disconnect(); navigate('/') }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#b9c2d6] hover:border-rose-400/40"
            >
              Exit
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Wallet Address" value={short(address)} />
          <StatCard label="BNB Balance" value={`${fmt(balances.bnb, 4)} BNB`} delay={40} />
          <StatCard label="USDT Balance" value={`${fmt(balances.usdt)} USDT`} delay={80} />
          <StatCard label="PAB-D Balance" value={`${fmt(balances.pabd)} PAB-D`} delay={120} />
        </section>

        <section className="mb-6">
          <StatCard label="Current Token Price" value={`$${fmt(data.token_price, 2)}`} />
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <button
            onClick={() => setBuyOpen(true)}
            className="glass animate-glow group rounded-2xl p-8 text-left transition hover:-translate-y-1"
          >
            <h2 className="text-3xl font-bold tracking-wide text-[#f6e3aa]">BUY TOKEN</h2>
            <p className="mt-3 text-[#b9c2d6]">Purchase PAB-D with USDT at ${fmt(data.token_price, 2)} per token.</p>
          </button>
          <button
            onClick={() => setStakeOpen(true)}
            className="glass group rounded-2xl p-8 text-left transition hover:-translate-y-1"
            style={{ animation: 'pulseGlow 2.8s ease-in-out infinite', animationDelay: '0.6s' }}
          >
            <h2 className="text-3xl font-bold tracking-wide text-[#9db7ff]">STAKE TOKEN</h2>
            <p className="mt-3 text-[#b9c2d6]">Lock PAB-D and earn estimated rewards.</p>
          </button>
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <article className="glass animate-fade-up rounded-2xl p-6">
            <small className="text-xs uppercase tracking-[0.14em] text-[#7c879f]">Portfolio overview</small>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ['Total Purchased', `${fmt(data.total_purchased)} PAB-D`],
                ['Total Staked', `${fmt(data.total_staked)} PAB-D`],
                ['Available Tokens', `${fmt(data.available_tokens)} PAB-D`],
                ['Locked Tokens', `${fmt(data.locked_tokens)} PAB-D`],
                ['Unlocked Tokens', `${fmt(data.unlocked_tokens)} PAB-D`],
                ['Claimable Tokens', `${fmt(data.claimable_tokens)} PAB-D`],
                ['Total Claimed', `${fmt(data.total_claimed)} PAB-D`],
                ['Portfolio Value', `$${fmt(data.portfolio_value)}`],
                ['Estimated Rewards', `${fmt(data.estimated_rewards)} PAB-D`],
                ['Next Unlock Date', data.next_unlock_date ? new Date(data.next_unlock_date).toLocaleDateString() : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[#7c879f]">{k}</span>
                  <b className="text-[#eef2fa]">{v}</b>
                </div>
              ))}
            </div>
          </article>

          <article className="glass animate-fade-up rounded-2xl p-6">
            <small className="text-xs uppercase tracking-[0.14em] text-[#7c879f]">Vesting</small>
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm text-[#b9c2d6]">
                <span>Progress</span>
                <span>{fmt(data.vesting_progress, 0)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#d9a94f] to-[#efcd75] transition-all duration-700"
                  style={{ width: `${Math.min(100, data.vesting_progress)}%` }}
                />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7c879f]">Purchased</div><b>{fmt(data.total_purchased)}</b></div>
                <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7c879f]">Locked</div><b>{fmt(data.locked_tokens)}</b></div>
                <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7c879f]">Unlocked</div><b>{fmt(data.unlocked_tokens)}</b></div>
                <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7c879f]">Claimable</div><b>{fmt(data.claimable_tokens)}</b></div>
              </div>
              <p className="mt-4 text-sm text-[#7c879f]">
                Next unlock: {data.next_unlock_date ? new Date(data.next_unlock_date).toLocaleString() : 'Fully unlocked schedule reached or no purchase yet'}
                {data.next_unlock_percent ? ` · ${data.next_unlock_percent}%` : ''}
              </p>
              <button
                disabled={data.claimable_tokens <= 0 || claiming}
                onClick={handleClaim}
                className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#d9a94f] to-[#b3812c] px-4 py-3 font-semibold text-[#0a1226] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {claiming ? 'Claiming…' : 'Claim Tokens'}
              </button>
            </div>
          </article>
        </section>
      </div>

      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} dashboard={data} onSuccess={setData} />
      <StakeModal open={stakeOpen} onClose={() => setStakeOpen(false)} dashboard={data} onSuccess={setData} />
    </div>
  )
}
