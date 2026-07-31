import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BuyModal } from '../components/BuyModal'
import { StakeModal } from '../components/StakeModal'
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // ignore
  }
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
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'dashboard' | 'portfolio' | 'stake' | 'transactions' | 'settings'>('dashboard')

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

  async function handleCopy() {
    if (!address) return
    await copyText(address)
    setCopied(true)
    toast.push('Wallet address copied', 'success')
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading || !data || !address) {
    return (
      <div className="dash-shell flex min-h-screen items-center justify-center">
        <div className="dash-card animate-glow px-8 py-6 text-[#b9c2d6]">Loading dashboard…</div>
      </div>
    )
  }

  const bnbUsd = balances.bnb * 600
  const pabdUsd = balances.pabd * data.token_price
  const priceInBnb = data.token_price / 600

  return (
    <div className="dash-shell min-h-screen pb-28">
      <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div className="flex items-center gap-3">
            <img src="/pabd-logo.png" alt="PAB-D" className="h-14 w-14 rounded-full object-cover shadow-[0_0_24px_rgba(217,169,79,0.35)]" />
            <div>
              <div className="text-lg font-bold tracking-[0.12em] text-[#f0d48a] md:text-xl">PAB-D DASHBOARD</div>
              <p className="text-sm text-[#8b95ad]">Private sale & staking portal</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button onClick={handleCopy} className="dash-chip flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d9a94f]/15 text-[#f0d48a]">◈</span>
              {short(address)}
            </button>
            <Link to="/history" className="dash-chip">History</Link>
            {localStorage.getItem('pabd_is_admin') === '1' && (
              <Link to="/admin" className="dash-chip">Admin</Link>
            )}
            <button
              onClick={() => { disconnect(); navigate('/') }}
              className="dash-chip hover:!border-rose-400/40"
            >
              Exit
            </button>
            <button className="dash-bell" aria-label="Notifications">🔔</button>
          </div>
        </header>

        {/* Welcome banner */}
        <section className="dash-banner mb-5 animate-fade-up">
          <div className="relative z-10 max-w-xl">
            <h1 className="text-2xl font-bold tracking-wide text-white md:text-3xl">WELCOME BACK!</h1>
            <p className="mt-2 text-sm text-[#c5cee3] md:text-base">
              Manage your assets and grow with <span className="text-[#f0d48a]">PAB-D</span>.
            </p>
            <p className="mt-3 text-xs tracking-[0.16em] text-[#7f8aa5]">SECURE · TRANSPARENT · DECENTRALIZED</p>
          </div>
          <img src="/pabd-coin.png" alt="" className="dash-banner-coin" />
        </section>

        {/* Balance cards */}
        <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="dash-card animate-fade-up p-4">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">
              <span>Wallet Address</span>
              <button onClick={handleCopy} className="text-[#f0d48a]">{copied ? '✓' : '⧉'}</button>
            </div>
            <div className="truncate text-xl font-semibold text-[#f0d48a]">{short(address)}</div>
          </article>

          <article className="dash-card animate-fade-up p-4" style={{ animationDelay: '40ms' }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">BNB Balance</span>
              <span className="dash-token-badge bg-[#f0b90b]/15 text-[#f0b90b]">BNB</span>
            </div>
            <div className="text-xl font-semibold text-white">{fmt(balances.bnb, 4)} BNB</div>
            <div className="mt-1 text-xs text-[#7f8aa5]">≈ ${fmt(bnbUsd)} USD</div>
          </article>

          <article className="dash-card animate-fade-up p-4" style={{ animationDelay: '80ms' }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">USDT Balance</span>
              <span className="dash-token-badge bg-[#26a17b]/15 text-[#26a17b]">USDT</span>
            </div>
            <div className="text-xl font-semibold text-white">{fmt(balances.usdt)} USDT</div>
            <div className="mt-1 text-xs text-[#7f8aa5]">≈ ${fmt(balances.usdt)} USD</div>
          </article>

          <article className="dash-card animate-fade-up p-4" style={{ animationDelay: '120ms' }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">PAB-D Balance</span>
              <img src="/pabd-logo.png" alt="" className="h-7 w-7 rounded-full object-cover" />
            </div>
            <div className="text-xl font-semibold text-white">{fmt(balances.pabd)} PAB-D</div>
            <div className="mt-1 text-xs text-[#7f8aa5]">≈ ${fmt(pabdUsd)} USD</div>
          </article>
        </section>

        {/* Price card */}
        <section className="dash-card mb-5 animate-fade-up overflow-hidden p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Current Token Price</div>
              <div className="mt-2 text-3xl font-bold text-[#f0d48a]">${fmt(data.token_price, 2)}</div>
              <div className="mt-1 text-sm text-[#8b95ad]">≈ {priceInBnb.toFixed(6)} BNB</div>
            </div>
            <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              +2.45% 24H CHANGE
            </div>
          </div>
          <svg className="mt-4 h-20 w-full" viewBox="0 0 600 80" preserveAspectRatio="none">
            <defs>
              <linearGradient id="priceStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3d64b8" />
                <stop offset="100%" stopColor="#7eb6ff" />
              </linearGradient>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(61,100,184,0.35)" />
                <stop offset="100%" stopColor="rgba(61,100,184,0)" />
              </linearGradient>
            </defs>
            <path d="M0,60 C60,55 90,48 140,42 C200,34 230,50 280,40 C340,28 380,18 430,24 C480,30 520,16 600,10 L600,80 L0,80 Z" fill="url(#priceFill)" />
            <path d="M0,60 C60,55 90,48 140,42 C200,34 230,50 280,40 C340,28 380,18 430,24 C480,30 520,16 600,10" fill="none" stroke="url(#priceStroke)" strokeWidth="3" />
          </svg>
        </section>

        {/* Buy / Stake */}
        <section className="mb-5 grid gap-4 md:grid-cols-2">
          <article className="dash-action gold animate-fade-up">
            <div className="dash-action-icon gold">🛒</div>
            <h2 className="mt-4 text-xl font-bold tracking-wide text-[#f0d48a]">BUY PAB-D TOKEN</h2>
            <p className="mt-2 text-sm text-[#b9c2d6]">
              Buy PAB-D tokens using USDT at the best available price.
            </p>
            <button onClick={() => setBuyOpen(true)} className="dash-btn-gold mt-5">
              BUY NOW →
            </button>
          </article>

          <article className="dash-action blue animate-fade-up" style={{ animationDelay: '60ms' }}>
            <div className="dash-action-icon blue">🔒</div>
            <h2 className="mt-4 text-xl font-bold tracking-wide text-[#9db7ff]">STAKE PAB-D TOKEN</h2>
            <p className="mt-2 text-sm text-[#b9c2d6]">
              Stake your PAB-D tokens and earn attractive rewards.
            </p>
            <button onClick={() => { setStakeOpen(true); setTab('stake') }} className="dash-btn-blue mt-5">
              STAKE NOW →
            </button>
          </article>
        </section>

        {/* Portfolio + Vesting */}
        <section className="mb-6 grid gap-4 lg:grid-cols-2" id="portfolio">
          <article className="dash-card animate-fade-up p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Portfolio Overview</div>
            <div className="space-y-3 text-sm">
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
                  <span className="text-[#7f8aa5]">{k}</span>
                  <b className="text-[#eef2fa]">{v}</b>
                </div>
              ))}
            </div>
          </article>

          <article className="dash-card animate-fade-up p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Vesting</div>
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
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Purchased</div><b>{fmt(data.total_purchased)}</b></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Locked</div><b>{fmt(data.locked_tokens)}</b></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Unlocked</div><b>{fmt(data.unlocked_tokens)}</b></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Claimable</div><b>{fmt(data.claimable_tokens)}</b></div>
            </div>
            <p className="mt-4 text-sm text-[#7f8aa5]">
              Next unlock: {data.next_unlock_date ? new Date(data.next_unlock_date).toLocaleString() : 'No unlock pending'}
              {data.next_unlock_percent ? ` · ${data.next_unlock_percent}%` : ''}
            </p>
            <button
              disabled={data.claimable_tokens <= 0 || claiming}
              onClick={handleClaim}
              className="dash-btn-gold mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
            >
              {claiming ? 'Claiming…' : 'Claim Tokens'}
            </button>
          </article>
        </section>
      </div>

      {/* Bottom nav */}
      <nav className="dash-bottom-nav">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => { setTab('dashboard'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <span>⌂</span>Dashboard
        </button>
        <button className={tab === 'portfolio' ? 'active' : ''} onClick={() => { setTab('portfolio'); document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' }) }}>
          <span>◉</span>Portfolio
        </button>
        <button className={tab === 'stake' ? 'active' : ''} onClick={() => { setTab('stake'); setStakeOpen(true) }}>
          <span>🔒</span>Stake
        </button>
        <button className={tab === 'transactions' ? 'active' : ''} onClick={() => navigate('/history')}>
          <span>☰</span>Transactions
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => navigate(localStorage.getItem('pabd_is_admin') === '1' ? '/admin' : '/history')}>
          <span>⚙</span>Settings
        </button>
      </nav>

      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} dashboard={data} onSuccess={setData} />
      <StakeModal open={stakeOpen} onClose={() => setStakeOpen(false)} dashboard={data} onSuccess={setData} />
    </div>
  )
}
