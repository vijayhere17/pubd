export const API_URL = import.meta.env.VITE_API_URL || '/api'
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 56)
// WalletConnect / Reown Project ID (public client id) — enables Trust Wallet + all WC wallets
export const WC_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID && import.meta.env.VITE_WC_PROJECT_ID !== 'pabd_demo_project_id'
    ? String(import.meta.env.VITE_WC_PROJECT_ID)
    : '4af55f52f76fcaa0e6c8437277d3719a'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://bscscan.com'

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
