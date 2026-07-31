import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BuyModal } from '../components/BuyModal'
import { StakeModal } from '../components/StakeModal'
import { useWallet } from '../hooks/useWallet'
import { getContracts, readTokenBalance } from '../lib/contracts'
import { fetchDashboard, type DashboardData } from '../lib/api'
import { useToast } from '../store/toast'
import { defaultUsdtAddress } from '../lib/config'

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
  const { address, disconnect, provider, restoring } = useWallet()
  const toast = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [balances, setBalances] = useState({ bnb: 0, usdt: 0, pabd: 0 })
  const [loading, setLoading] = useState(true)
  const [buyOpen, setBuyOpen] = useState(false)
  const [stakeOpen, setStakeOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [balanceTick, setBalanceTick] = useState(0)

  const refresh = useCallback(async () => {
    const dash = await fetchDashboard()
    setData(dash)
    return dash
  }, [])

  const reloadBalances = useCallback(async (dash?: DashboardData | null) => {
    const settings = dash?.settings ?? data?.settings
    if (!provider || !address || !settings) return
    try {
      const bnbWei = await provider.getBalance(address)
      const usdtAddress = settings.usdt_address || defaultUsdtAddress(settings.chain_id || 56)
      const { usdt, token } = getContracts(provider, {
        usdt: usdtAddress,
        token: settings.token_address,
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
  }, [provider, address, data])

  useEffect(() => {
    if (restoring) return
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
  }, [address, restoring, navigate, refresh, toast])

  useEffect(() => {
    reloadBalances(data)
  }, [provider, address, data, balanceTick, reloadBalances])

  async function handleTradeSuccess(next: DashboardData) {
    setData(next)
    setBalanceTick((t) => t + 1)
    // small delay so RPC can catch the new block
    setTimeout(() => {
      reloadBalances(next)
    }, 1500)
  }

  async function handleCopy() {
    if (!address) return
    await copyText(address)
    setCopied(true)
    toast.push('Wallet address copied', 'success')
    setTimeout(() => setCopied(false), 1500)
  }

  if (restoring || loading || !data || !address) {
    return (
      <div className="dash-shell flex min-h-screen items-center justify-center">
        <div className="dash-card animate-glow px-8 py-6 text-[#b9c2d6]">Loading dashboard…</div>
      </div>
    )
  }

  // Stake from wallet PAB-D (on-chain). Portfolio "purchased" is app history only.
  const stakeable = balances.pabd

  const bnbUsd = balances.bnb * 600
  const pabdUsd = balances.pabd * data.token_price
  const priceInBnb = data.token_price / 600

  return (
    <div className="dash-shell min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
        {/* Header */}
        <header className="dash-header mb-6 animate-fade-up">
          <Link to="/dashboard" className="dash-brand" aria-label="PAB-D Dashboard">
            <img src="/pabd-logo.png" alt="PAB-D" className="dash-logo" />
            <div className="dash-brand-copy">
              <div className="dash-brand-title">PAB-D</div>
              <div className="dash-brand-sub">Private Sale & Staking Portal</div>
            </div>
          </Link>

          <div className="dash-header-actions">
            <button onClick={handleCopy} className="dash-chip flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#d9a94f]/15 text-[#f0d48a]">◈</span>
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
            <button onClick={() => setStakeOpen(true)} className="dash-btn-blue mt-5">
              STAKE NOW →
            </button>
          </article>
        </section>

        {/* Portfolio + Staking overview */}
        <section className="mb-6 grid gap-4 lg:grid-cols-2" id="portfolio">
          <article className="dash-card animate-fade-up p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">Portfolio Overview</div>
            <div className="space-y-3 text-sm">
              {[
                ['Total Purchased', `${fmt(data.total_purchased)} PAB-D`],
                ['Total Staked', `${fmt(data.total_staked)} PAB-D`],
                ['Available to Stake', `${fmt(stakeable)} PAB-D`],
                ['Locked in Staking', `${fmt(data.locked_tokens)} PAB-D`],
                ['Portfolio Value', `$${fmt(balances.pabd * data.token_price)}`],
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
            <div className="mb-4 text-xs uppercase tracking-[0.14em] text-[#7f8aa5]">How it works</div>
            <ol className="space-y-3 text-sm text-[#b9c2d6]">
              <li><b className="text-[#f0d48a]">1. Buy</b> — Pay USDT, get PAB-D instantly in your wallet.</li>
              <li><b className="text-[#9db7ff]">2. Stake</b> — Lock PAB-D for 100–500 days and earn APY rewards.</li>
              <li><b className="text-white">3. Unstake later</b> — After lock ends, get principal + rewards.</li>
            </ol>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Wallet PAB-D</div><b>{fmt(balances.pabd)}</b></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Available</div><b>{fmt(stakeable)}</b></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Staked</div><b>{fmt(data.total_staked)}</b></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="text-[#7f8aa5]">Rewards Est.</div><b>{fmt(data.estimated_rewards)}</b></div>
            </div>
            <button onClick={() => setStakeOpen(true)} className="dash-btn-blue mt-5 w-full">
              Stake Available PAB-D →
            </button>
          </article>
        </section>
      </div>

      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} dashboard={data} onSuccess={handleTradeSuccess} />
      <StakeModal
        open={stakeOpen}
        onClose={() => setStakeOpen(false)}
        dashboard={data}
        walletPabd={balances.pabd}
        onSuccess={handleTradeSuccess}
      />
    </div>
  )
}
