export const API_URL = import.meta.env.VITE_API_URL || '/api'
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 56)
// WalletConnect / Reown Project ID (public client id) — enables Trust Wallet + all WC wallets
export const WC_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID && import.meta.env.VITE_WC_PROJECT_ID !== 'pabd_demo_project_id'
    ? String(import.meta.env.VITE_WC_PROJECT_ID)
    : '4af55f52f76fcaa0e6c8437277d3719a'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://bscscan.com'

// Official BEP-20 USDT on BSC mainnet (used when Admin has not set custom USDT yet)
export const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'
export const BSC_TESTNET_USDT_ADDRESS = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'

export function defaultUsdtAddress(chainId = CHAIN_ID): string {
  if (import.meta.env.VITE_USDT_ADDRESS) return String(import.meta.env.VITE_USDT_ADDRESS)
  return chainId === 97 ? BSC_TESTNET_USDT_ADDRESS : BSC_USDT_ADDRESS
}

export const BSC = {
  chainId: CHAIN_ID,
  chainIdHex: `0x${CHAIN_ID.toString(16)}`,
  name: CHAIN_ID === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain',
  rpcUrls: CHAIN_ID === 97
    ? ['https://data-seed-prebsc-1-s1.binance.org:8545/']
    : ['https://bsc-dataseed.binance.org/'],
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  blockExplorerUrls: [EXPLORER_URL],
}

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
] as const
