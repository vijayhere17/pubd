import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../store/toast'

type Settings = Record<string, unknown>

export function Admin() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const toast = useToast()
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [settings, setSettings] = useState<Settings>({})
  const [investors, setInvestors] = useState<unknown[]>([])
  const [tab, setTab] = useState<'settings' | 'investors' | 'stakers' | 'claims'>('settings')
  const [stakers, setStakers] = useState<unknown[]>([])
  const [claims, setClaims] = useState<unknown[]>([])

  useEffect(() => {
    if (!address || !localStorage.getItem('pabd_token')) {
      navigate('/')
      return
    }
    Promise.all([
      api.get('/admin/dashboard'),
      api.get('/admin/settings'),
    ]).then(([dash, set]) => {
      setStats(dash.data)
      setSettings(set.data)
    }).catch(() => {
      toast.push('Admin access required', 'error')
      navigate('/dashboard')
    })
  }, [address, navigate, toast])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { data } = await api.put('/admin/settings', settings)
      setSettings(data)
      toast.push('Settings saved', 'success')
    } catch (err) {
      toast.push((err as Error).message || 'Save failed', 'error')
    }
  }

  async function loadTab(next: typeof tab) {
    setTab(next)
    if (next === 'investors') {
      const { data } = await api.get('/admin/investors')
      setInvestors(data.data || data)
    }
    if (next === 'stakers') {
      const { data } = await api.get('/admin/stakers')
      setStakers(data.data || data)
    }
    if (next === 'claims') {
      const { data } = await api.get('/admin/claims')
      setClaims(data.data || data)
    }
  }

  if (!stats) {
    return <div className="flex min-h-screen items-center justify-center text-[#b9c2d6]">Loading admin…</div>
  }

  const saleConfigured = /^0x[a-fA-F0-9]{40}$/.test(String(settings.sale_address || ''))
  const usdtConfigured = /^0x[a-fA-F0-9]{40}$/.test(String(settings.usdt_address || ''))
  const tokenConfigured = /^0x[a-fA-F0-9]{40}$/.test(String(settings.token_address || ''))
  const stakingConfigured = /^0x[a-fA-F0-9]{40}$/.test(String(settings.staking_address || ''))
  const buyReady = saleConfigured && usdtConfigured && tokenConfigured && settings.sale_active !== false
  const stakeReady = stakingConfigured && tokenConfigured

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#f6e3aa]">Admin Panel</h1>
            <p className="text-sm text-[#7c879f]">Sale, vesting, staking and investor controls</p>
          </div>
          <Link to="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm">User Dashboard</Link>
        </header>

        <div className={`mb-3 rounded-2xl border px-4 py-3 text-sm ${buyReady ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
          {buyReady
            ? 'Buy is LIVE — Sale/USDT/Token addresses are set. Users can pay USDT and receive PAB-D.'
            : 'Buy is DISABLED — set Sale Address + USDT Address + Token Address below, keep sale active. Until then no on-chain payment and no history will be created.'}
        </div>
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${stakeReady ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
          {stakeReady
            ? 'Staking address is set. Staked PAB-D locks in the Staking contract (not treasury/admin). Ensure Staking pabd() matches Token Address and fundRewards is funded.'
            : 'Staking is DISABLED until Admin sets Staking Address + Token Address. Redeploy Staking with token 0xb521… if the old address has no code.'}
        </div>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['Investors', stats.investors],
            ['Raised USDT', stats.total_raised_usdt],
            ['Tokens Sold', stats.total_purchased_tokens],
            ['Active Stakers', stats.active_stakers],
            ['Total Staked', stats.total_staked],
            ['Total Claimed', stats.total_claimed],
          ] as Array<[string, unknown]>).map(([label, value]) => (
            <article key={label} className="glass rounded-2xl p-4">
              <small className="text-[#7c879f]">{label}</small>
              <div className="mt-1 text-xl text-[#f6e3aa]">{Number(value as number || 0).toLocaleString()}</div>
            </article>
          ))}
        </section>

        <div className="mb-4 flex flex-wrap gap-2">
          {(['settings', 'investors', 'stakers', 'claims'] as const).map((t) => (
            <button key={t} onClick={() => loadTab(t)} className={`rounded-xl px-4 py-2 text-sm capitalize ${tab === t ? 'bg-[#d9a94f] text-[#0a1226] font-semibold' : 'border border-white/10'}`}>{t}</button>
          ))}
          <button
            onClick={async () => { await api.post('/admin/sale/pause'); toast.push('Sale paused', 'info') }}
            className="rounded-xl border border-rose-400/30 px-4 py-2 text-sm text-rose-200"
          >Pause Sale</button>
          <button
            onClick={async () => { await api.post('/admin/sale/resume'); toast.push('Sale resumed', 'success') }}
            className="rounded-xl border border-emerald-400/30 px-4 py-2 text-sm text-emerald-200"
          >Resume Sale</button>
          <button
            type="button"
            onClick={async () => {
              const res = await api.get('/admin/export', { params: { type: 'purchases' }, responseType: 'blob' })
              const url = URL.createObjectURL(res.data)
              const a = document.createElement('a')
              a.href = url
              a.download = 'pabd-purchases.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm"
          >Export Reports</button>
        </div>

        {tab === 'settings' && (
          <form onSubmit={saveSettings} className="glass grid gap-4 rounded-2xl p-6 md:grid-cols-2">
            <p className="md:col-span-2 text-sm text-[#b9c2d6]">
              <b className="text-[#f6e3aa]">Sale Address</b> controls the live buy contract. Change it anytime and Save —
              the app will use the new Sale for payments. Clear it to stop all buys.
            </p>
            {[
              ['token_price', 'Token Price (USD)'],
              ['min_stake_usd', 'Min Stake USD (e.g. 500)'],
              ['min_buy', 'Minimum Buy'],
              ['max_buy', 'Maximum Buy'],
              ['usdt_address', 'USDT Address *'],
              ['treasury_wallet', 'Treasury Wallet'],
              ['token_address', 'Token Address *'],
              ['sale_address', 'Sale Address * (required for buy)'],
              ['staking_address', 'Staking Address'],
              ['vesting_address', 'Vesting Address'],
              ['stake_apy_default', 'Stake APY'],
              ['chain_id', 'Chain ID'],
              ['explorer_url', 'Explorer URL'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className={`mb-1 block ${key === 'sale_address' ? 'text-[#f0d48a]' : 'text-[#7c879f]'}`}>{label}</span>
                <input
                  className={`w-full rounded-xl border bg-[#040914] px-3 py-2 ${key === 'sale_address' ? 'border-[#d9a94f]/50' : 'border-white/10'}`}
                  value={String(settings[key] ?? (key === 'min_stake_usd' ? '500' : ''))}
                  placeholder={key.includes('address') || key.includes('wallet') ? '0x...' : ''}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                />
              </label>
            ))}
            <p className="md:col-span-2 text-xs text-[#7c879f]">
              Min stake in PAB-D = Min Stake USD ÷ Token Price
              {(() => {
                const price = Number(settings.token_price || 0.1)
                const usd = Number(settings.min_stake_usd || 500)
                const pabd = price > 0 ? usd / price : 0
                return price > 0
                  ? ` → currently ≈ ${pabd.toLocaleString(undefined, { maximumFractionDigits: 4 })} PAB-D. If price changes, also call setMinStakeAmount on the Staking contract so on-chain min matches.`
                  : '.'
              })()}
            </p>
            <label className="flex items-center gap-3 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={settings.sale_active !== false}
                onChange={(e) => setSettings((s) => ({ ...s, sale_active: e.target.checked }))}
              />
              <span className="text-[#b9c2d6]">Sale Active (uncheck to pause buys without clearing addresses)</span>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[#7c879f]">Vesting Schedule (JSON)</span>
              <textarea
                className="min-h-28 w-full rounded-xl border border-white/10 bg-[#040914] px-3 py-2 font-mono text-xs"
                value={JSON.stringify(settings.vesting_schedule ?? [], null, 2)}
                onChange={(e) => {
                  try { setSettings((s) => ({ ...s, vesting_schedule: JSON.parse(e.target.value) })) } catch { /* keep typing */ }
                }}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[#7c879f]">Lock Periods (JSON)</span>
              <textarea
                className="min-h-28 w-full rounded-xl border border-white/10 bg-[#040914] px-3 py-2 font-mono text-xs"
                value={JSON.stringify(settings.lock_periods ?? [], null, 2)}
                onChange={(e) => {
                  try { setSettings((s) => ({ ...s, lock_periods: JSON.parse(e.target.value) })) } catch { /* keep typing */ }
                }}
              />
            </label>
            <div className="md:col-span-2">
              <button className="rounded-xl bg-gradient-to-r from-[#d9a94f] to-[#b3812c] px-5 py-3 font-semibold text-[#0a1226]">Save Settings</button>
            </div>
          </form>
        )}

        {tab === 'investors' && (
          <pre className="glass overflow-auto rounded-2xl p-4 text-xs text-[#b9c2d6]">{JSON.stringify(investors, null, 2)}</pre>
        )}
        {tab === 'stakers' && (
          <pre className="glass overflow-auto rounded-2xl p-4 text-xs text-[#b9c2d6]">{JSON.stringify(stakers, null, 2)}</pre>
        )}
        {tab === 'claims' && (
          <pre className="glass overflow-auto rounded-2xl p-4 text-xs text-[#b9c2d6]">{JSON.stringify(claims, null, 2)}</pre>
        )}
      </div>
    </div>
  )
}
