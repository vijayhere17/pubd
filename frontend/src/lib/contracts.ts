import { Contract, parseUnits, formatUnits, BrowserProvider, type Signer } from 'ethers'
import PrivateSaleAbi from '../abi/PrivateSale'
import StakingAbi from '../abi/Staking'
import VestingAbi from '../abi/VestingVault'
import { ERC20_ABI } from './config'

export function getContracts(signerOrProvider: BrowserProvider | Signer, addresses: {
  usdt?: string | null
  token?: string | null
  sale?: string | null
  staking?: string | null
  vesting?: string | null
}) {
  const usdt = addresses.usdt ? new Contract(addresses.usdt, ERC20_ABI, signerOrProvider as never) : null
  const token = addresses.token ? new Contract(addresses.token, ERC20_ABI, signerOrProvider as never) : null
  const sale = addresses.sale ? new Contract(addresses.sale, PrivateSaleAbi as never, signerOrProvider as never) : null
  const staking = addresses.staking ? new Contract(addresses.staking, StakingAbi as never, signerOrProvider as never) : null
  const vesting = addresses.vesting ? new Contract(addresses.vesting, VestingAbi as never, signerOrProvider as never) : null
  return { usdt, token, sale, staking, vesting }
}

export async function readTokenBalance(contract: Contract | null, wallet: string) {
  if (!contract || !wallet) return 0
  const [raw, decimals] = await Promise.all([
    contract.balanceOf(wallet),
    contract.decimals().catch(() => 18),
  ])
  return Number(formatUnits(raw, decimals))
}

export async function approveUsdt(usdt: Contract, spender: string, amount: string) {
  const decimals = await usdt.decimals().catch(() => 18)
  const value = parseUnits(amount, decimals)
  const tx = await usdt.approve(spender, value)
  await tx.wait()
  return tx.hash as string
}

export async function buyTokens(sale: Contract, usdtAmount: string, usdtDecimals = 18) {
  const value = parseUnits(usdtAmount, usdtDecimals)
  const tx = await sale.buy(value)
  const receipt = await tx.wait()
  return { hash: tx.hash as string, blockNumber: receipt?.blockNumber as number }
}

export async function stakeTokens(staking: Contract, amount: string, lockDays: number, decimals = 18) {
  const value = parseUnits(amount, decimals)
  const tx = await staking.stake(value, lockDays)
  const receipt = await tx.wait()
  return { hash: tx.hash as string, blockNumber: receipt?.blockNumber as number }
}

export async function claimVested(vesting: Contract) {
  const tx = await vesting.claim()
  const receipt = await tx.wait()
  return { hash: tx.hash as string, blockNumber: receipt?.blockNumber as number }
}

export { parseUnits, formatUnits }
