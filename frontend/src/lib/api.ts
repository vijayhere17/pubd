import axios from 'axios'
import { API_URL } from './config'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pabd_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export type StakeRow = {
  id: number
  onchain_stake_id: number | null
  amount: number
  lock_days: number
  bonus_percent: number
  estimated_reward: number
  total_return: number
  starts_at: string | null
  ends_at: string | null
  claimable: boolean
  status: string
  tx_hash?: string
}

export type DashboardData = {
  wallet_address: string
  token_price: number
  total_purchased: number
  total_staked: number
  available_tokens: number
  locked_tokens: number
  unlocked_tokens: number
  claimable_tokens: number
  total_claimed: number
  portfolio_value: number
  estimated_rewards: number
  next_unlock_date: string | null
  next_unlock_percent: number | null
  vesting_progress: number
  active_stakes: number
  stakes?: StakeRow[]
  settings: {
    sale_active: boolean
    min_buy: number
    max_buy: number
    min_stake?: number
    usdt_address: string | null
    token_address: string | null
    sale_address: string | null
    staking_address: string | null
    vesting_address: string | null
    treasury_wallet: string | null
    chain_id: number
    explorer_url: string
    lock_periods: Array<{ days: number; apy: number }>
    vesting_schedule: Array<{ days: number; unlock_percent: number }>
  }
}

export async function walletLogin(wallet: string, signature?: string, nonce?: string) {
  const { data } = await api.post('/wallet-login', { wallet, signature, nonce })
  localStorage.setItem('pabd_token', data.token)
  localStorage.setItem('pabd_wallet', wallet.toLowerCase())
  localStorage.setItem('pabd_is_admin', data.user?.is_admin ? '1' : '0')
  return data
}

export async function fetchNonce(wallet: string) {
  const { data } = await api.post('/auth/nonce', { wallet })
  return data as { message: string; nonce: string; wallet: string }
}

export async function fetchDashboard() {
  const { data } = await api.get<DashboardData>('/dashboard')
  return data
}

export async function fetchConfig() {
  const { data } = await api.get('/config')
  return data
}

export async function recordBuy(payload: Record<string, unknown>) {
  const { data } = await api.post('/transactions/buy', payload)
  return data
}

export async function recordStake(payload: Record<string, unknown>) {
  const { data } = await api.post('/transactions/stake', payload)
  return data
}

export async function recordClaim(payload: Record<string, unknown>) {
  const { data } = await api.post('/transactions/claim', payload)
  return data
}

export async function fetchHistory() {
  const { data } = await api.get('/transactions/history')
  return data
}
