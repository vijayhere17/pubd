import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { BrowserProvider, type Eip1193Provider } from 'ethers'
import EthereumProvider from '@walletconnect/ethereum-provider'
import { BSC, CHAIN_ID, WC_PROJECT_ID } from '../lib/config'
import { fetchNonce, walletLogin } from '../lib/api'
import { useToast } from '../store/toast'

type InjectedProvider = Eip1193Provider & {
  isMetaMask?: boolean
  isTrust?: boolean
  isTrustWallet?: boolean
  providers?: InjectedProvider[]
  on?: (e: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (e: string, cb: (...args: unknown[]) => void) => void
}

type WalletContextValue = {
  address: string | null
  provider: BrowserProvider | null
  connecting: boolean
  restoring: boolean
  connectMetaMask: () => Promise<string>
  connectTrustWallet: () => Promise<string>
  connectInjected: () => Promise<string>
  connectWalletConnect: () => Promise<string>
  disconnect: () => void
  ensureBsc: () => Promise<void>
  getSigner: () => Promise<Awaited<ReturnType<BrowserProvider['getSigner']>>>
}

const WalletContext = createContext<WalletContextValue | null>(null)

function getWindowEthereum(): InjectedProvider | undefined {
  return (window as unknown as { ethereum?: InjectedProvider }).ethereum
}

function pickInjectedProvider(prefer: 'metamask' | 'trust' | 'any' = 'any'): InjectedProvider | null {
  const ethereum = getWindowEthereum()
  if (!ethereum) return null

  const list = ethereum.providers?.length ? ethereum.providers : [ethereum]

  if (prefer === 'metamask') {
    return list.find((p) => p.isMetaMask && !p.isTrust && !p.isTrustWallet) || list.find((p) => p.isMetaMask) || null
  }

  if (prefer === 'trust') {
    return list.find((p) => p.isTrust || p.isTrustWallet) || null
  }

  return (
    list.find((p) => p.isTrust || p.isTrustWallet) ||
    list.find((p) => p.isMetaMask) ||
    list[0] ||
    null
  )
}

async function switchToBsc(eip1193: Eip1193Provider) {
  try {
    await eip1193.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC.chainIdHex }],
    })
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code
    if (code === 4902) {
      await eip1193.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BSC.chainIdHex,
          chainName: BSC.name,
          nativeCurrency: BSC.nativeCurrency,
          rpcUrls: BSC.rpcUrls,
          blockExplorerUrls: BSC.blockExplorerUrls,
        }],
      })
    } else {
      throw err
    }
  }
}

async function isUserRejection(err: unknown): boolean {
  const code = (err as { code?: number | string })?.code
  if (code === 4001 || code === 'ACTION_REJECTED' || code === '4001') return true
  const msg = String((err as Error)?.message || '')
  return /user rejected|rejected the request|denied|cancelled|canceled/i.test(msg)
}

async function authenticate(address: string, eip1193: Eip1193Provider) {
  const { message, nonce } = await fetchNonce(address)
  try {
    const signature = await eip1193.request({
      method: 'personal_sign',
      params: [message, address],
    }) as string
    await walletLogin(address, signature, nonce)
  } catch (err: unknown) {
    // Cancel / reject must NOT fall back to unsigned login (that was connecting anyway).
    if (isUserRejection(err)) {
      throw new Error('Wallet connection was cancelled.')
    }
    throw err instanceof Error ? err : new Error('Wallet authentication failed.')
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(localStorage.getItem('pabd_wallet'))
  const [rawProvider, setRawProvider] = useState<Eip1193Provider | null>(null)
  const [providerEpoch, setProviderEpoch] = useState(0)
  const [connecting, setConnecting] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const toast = useToast()

  // Do not hard-lock network here. A forced chain id (e.g. stale build on 97)
  // makes ethers reject mainnet balance reads and the dashboard shows 0.
  const provider = useMemo(
    () => (rawProvider ? new BrowserProvider(rawProvider) : null),
    [rawProvider, providerEpoch],
  )

  const finishConnect = useCallback(async (eip1193: Eip1193Provider) => {
    await switchToBsc(eip1193)
    const accounts = await eip1193.request({ method: 'eth_requestAccounts' }) as string[]
    const account = accounts[0]
    if (!account) throw new Error('No account returned')
    const normalized = account.toLowerCase()
    try {
      // Authenticate first. Only then mark the wallet as connected.
      await authenticate(normalized, eip1193)
      setRawProvider(eip1193)
      setAddress(normalized)
      return normalized
    } catch (err) {
      setRawProvider(null)
      setAddress(null)
      localStorage.removeItem('pabd_token')
      localStorage.removeItem('pabd_wallet')
      localStorage.removeItem('pabd_is_admin')
      throw err
    }
  }, [])

  // Keep session alive on refresh: reattach injected provider without forcing a new popup when possible.
  useEffect(() => {
    let cancelled = false
    async function restoreSession() {
      const savedWallet = localStorage.getItem('pabd_wallet')
      const savedToken = localStorage.getItem('pabd_token')
      if (!savedWallet || !savedToken) {
        if (!cancelled) setRestoring(false)
        return
      }
      const injected = pickInjectedProvider('any')
      if (!injected) {
        if (!cancelled) setRestoring(false)
        return
      }
      try {
        const accounts = await injected.request({ method: 'eth_accounts' }) as string[]
        const current = accounts[0]?.toLowerCase()
        if (!current) {
          if (!cancelled) setRestoring(false)
          return
        }
        await switchToBsc(injected).catch(() => undefined)
        if (cancelled) return
        setRawProvider(injected)
        setAddress(current)
        localStorage.setItem('pabd_wallet', current)
        // Re-login quietly if wallet changed or token may be stale
        if (current !== savedWallet.toLowerCase() || !savedToken) {
          await authenticate(current, injected)
        }
      } catch {
        // leave user on connect screen if restore fails
      } finally {
        if (!cancelled) setRestoring(false)
      }
    }
    restoreSession()
    return () => { cancelled = true }
  }, [])

  const connectWithProvider = useCallback(async (
    eip1193: Eip1193Provider | null,
    missingMessage: string,
    successMessage: string,
  ) => {
    setConnecting(true)
    try {
      if (!eip1193) throw new Error(missingMessage)
      const addr = await finishConnect(eip1193)
      toast.push(successMessage, 'success')
      return addr
    } catch (e: unknown) {
      const msg = (e as { message?: string; code?: number })?.code === 4001
        ? 'Wallet connection was cancelled.'
        : ((e as Error).message || 'Unable to connect')
      toast.push(msg, 'error')
      throw e
    } finally {
      setConnecting(false)
    }
  }, [finishConnect, toast])

  const connectWalletConnect = useCallback(async (label = 'Wallet') => {
    setConnecting(true)
    try {
      if (!WC_PROJECT_ID) {
        throw new Error('WalletConnect Project ID missing.')
      }

      const wc = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        optionalChains: [CHAIN_ID, 56, 97],
        chains: [CHAIN_ID],
        showQrModal: true,
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
        events: ['chainChanged', 'accountsChanged'],
        metadata: {
          name: 'PAB-D',
          description: 'PAB-D Private Sale & Staking',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://pabd.finance',
          icons: [typeof window !== 'undefined' ? `${window.location.origin}/pabd-logo.png` : ''],
        },
        qrModalOptions: {
          themeMode: 'dark',
        },
      })

      await wc.enable()
      const addr = await finishConnect(wc as unknown as Eip1193Provider)
      toast.push(`${label} connected`, 'success')
      return addr
    } catch (e: unknown) {
      toast.push((e as Error).message || 'Wallet connection failed', 'error')
      throw e
    } finally {
      setConnecting(false)
    }
  }, [finishConnect, toast])

  const connectMetaMask = useCallback(async () => {
    return connectWithProvider(
      pickInjectedProvider('metamask'),
      'MetaMask not found. Install MetaMask or use WalletConnect / Trust Wallet.',
      'MetaMask connected',
    )
  }, [connectWithProvider])

  const connectTrustWallet = useCallback(async () => {
    const injectedTrust = pickInjectedProvider('trust')
    if (injectedTrust) {
      return connectWithProvider(injectedTrust, 'Trust Wallet not found', 'Trust Wallet connected')
    }
    return connectWalletConnect('Trust Wallet')
  }, [connectWithProvider, connectWalletConnect])

  const connectInjected = useCallback(async () => {
    return connectWithProvider(
      pickInjectedProvider('any'),
      'No browser wallet found. Install MetaMask/Trust Wallet or use WalletConnect.',
      'Wallet connected',
    )
  }, [connectWithProvider])

  const disconnect = useCallback(() => {
    setAddress(null)
    setRawProvider(null)
    localStorage.removeItem('pabd_token')
    localStorage.removeItem('pabd_wallet')
    localStorage.removeItem('pabd_is_admin')
  }, [])

  const ensureBsc = useCallback(async () => {
    if (!rawProvider) throw new Error('Wallet not connected')
    await switchToBsc(rawProvider)
  }, [rawProvider])

  const getSigner = useCallback(async () => {
    if (!provider) throw new Error('Wallet not connected')
    await ensureBsc()
    return provider.getSigner()
  }, [provider, ensureBsc])

  useEffect(() => {
    const ethereum = getWindowEthereum()
    if (!ethereum?.on) return
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      if (!accounts?.[0]) disconnect()
      else setAddress(accounts[0].toLowerCase())
    }
    const onChainChanged = () => {
      // Recreate BrowserProvider against the wallet's new network.
      setProviderEpoch((n) => n + 1)
    }
    ethereum.on('accountsChanged', onAccounts)
    ethereum.on('chainChanged', onChainChanged)
    return () => {
      ethereum.removeListener?.('accountsChanged', onAccounts)
      ethereum.removeListener?.('chainChanged', onChainChanged)
    }
  }, [disconnect])

  const value = useMemo(() => ({
    address,
    provider,
    connecting,
    restoring,
    connectMetaMask,
    connectTrustWallet,
    connectInjected,
    connectWalletConnect: () => connectWalletConnect('WalletConnect'),
    disconnect,
    ensureBsc,
    getSigner,
  }), [
    address,
    provider,
    connecting,
    restoring,
    connectMetaMask,
    connectTrustWallet,
    connectInjected,
    connectWalletConnect,
    disconnect,
    ensureBsc,
    getSigner,
  ])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
