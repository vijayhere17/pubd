import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchHistory } from '../lib/api'
import { useWallet } from '../hooks/useWallet'

type Tab = 'buy' | 'stake' | 'claim' | 'wallet'

export function History() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('buy')
  const [data, setData] = useState<Record<string, Array<Record<string, unknown>>>>({})

  useEffect(() => {
    if (!address || !localStorage.getItem('pabd_token')) {
      navigate('/')
      return
    }
    fetchHistory().then(setData).catch(() => navigate('/'))
  }, [address, navigate])

  const rows = data[tab] || []

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#f6e3aa]">Transaction History</h1>
            <p className="text-sm text-[#7c879f]">Buy, stake, claim and wallet activity</p>
          </div>
          <Link to="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#b9c2d6]">Back to Dashboard</Link>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {(['buy', 'stake', 'claim', 'wallet'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-sm capitalize ${
                tab === t
                  ? 'bg-gradient-to-r from-[#d9a94f] to-[#b3812c] text-[#0a1226] font-semibold'
                  : 'border border-white/10 text-[#b9c2d6]'
              }`}
            >
              {t} History
            </button>
          ))}
        </div>

        <div className="glass overflow-x-auto rounded-2xl">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-[#7c879f]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Transaction Hash</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className="px-4 py-8 text-[#7c879f]" colSpan={5}>No transactions yet.</td></tr>
              )}
              {rows.map((row) => {
                const hash = String(row.tx_hash || '')
                const amount = row.token_amount ?? row.amount ?? row.usdt_amount ?? 0
                const explorer = String(row.explorer_url || `https://bscscan.com/tx/${hash}`)
                const date = String(row.purchased_at || row.claimed_at || row.occurred_at || row.created_at || '')
                return (
                  <tr key={hash || String(row.id)} className="border-b border-white/5">
                    <td className="px-4 py-3 text-[#b9c2d6]">{date ? new Date(date).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#eef2fa]">{hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : '—'}</td>
                    <td className="px-4 py-3 text-[#f6e3aa]">{Number(amount).toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize text-emerald-300">{String(row.status || 'confirmed')}</td>
                    <td className="px-4 py-3">
                      {hash ? <a className="text-[#9db7ff] underline" href={explorer} target="_blank" rel="noreferrer">View</a> : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
