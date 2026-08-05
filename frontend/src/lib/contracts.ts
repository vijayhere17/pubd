import { Contract, parseUnits, formatUnits, BrowserProvider, JsonRpcProvider, type Signer } from 'ethers'
import PrivateSaleAbi from '../abi/PrivateSale'
import StakingAbi from '../abi/Staking'
import VestingAbi from '../abi/VestingVault'
import { ERC20_ABI } from './config'

type ChainReader = BrowserProvider | JsonRpcProvider | Signer

export function getContracts(signerOrProvider: ChainReader, addresses: {
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
  if (!receipt || Number(receipt.status) !== 1) {
    throw new Error('Buy transaction failed on-chain. No payment and no history recorded.')
  }

  // Require TokensPurchased event from this Sale contract
  let purchased = false
  for (const log of receipt.logs || []) {
    try {
      const parsed = sale.interface.parseLog(log)
      if (parsed?.name === 'TokensPurchased') {
        purchased = true
        break
      }
    } catch {
      // ignore unrelated logs
    }
  }
  if (!purchased) {
    throw new Error('Buy did not emit TokensPurchased. Payment was not completed.')
  }

  return { hash: tx.hash as string, blockNumber: receipt.blockNumber as number }
}

export async function stakeTokens(staking: Contract, amount: string, lockDays: number, decimals = 18) {
  const value = parseUnits(amount, decimals)
  const tx = await staking.stake(value, lockDays)
  const receipt = await tx.wait()
  if (!receipt || Number(receipt.status) !== 1) {
    throw new Error('Stake transaction failed on-chain. No history recorded.')
  }
  let stakeId: number | null = null
  for (const log of receipt.logs || []) {
    try {
      const parsed = staking.interface.parseLog(log)
      if (parsed?.name === 'Staked') {
        stakeId = Number(parsed.args.stakeId)
        break
      }
    } catch {
      // not this contract's log
    }
  }
  if (stakeId === null) {
    throw new Error('Stake did not emit Staked event. Tokens were not locked. No history recorded.')
  }
  return { hash: tx.hash as string, blockNumber: receipt.blockNumber as number, stakeId }
}

/** Preflight: staking must be a real contract, correct token, and funded rewards. */
export async function assertStakingReady(
  readProvider: BrowserProvider | JsonRpcProvider,
  stakingAddress: string,
  tokenAddress: string,
  stakeAmount: string,
  lockDays: number,
) {
  const code = await readProvider.getCode(stakingAddress)
  if (!code || code === '0x') {
    throw new Error('Staking Address has no contract on this network. Redeploy Staking and update Admin.')
  }

  const { staking } = getContracts(readProvider, { staking: stakingAddress })
  if (!staking) throw new Error('Staking contract missing')

  const onchainToken = String(await staking.pabd()).toLowerCase()
  if (onchainToken !== tokenAddress.toLowerCase()) {
    throw new Error(
      `Staking pabd() is ${onchainToken}, but Admin Token Address is ${tokenAddress}. Redeploy Staking with the correct token.`,
    )
  }

  const paused = Boolean(await staking.paused())
  if (paused) throw new Error('Staking contract is paused.')

  const minRaw: bigint = await staking.minStakeAmount()
  const value = parseUnits(stakeAmount, 18)
  if (value < minRaw) {
    throw new Error(`Minimum stake is ${formatUnits(minRaw, 18)} PAB-D.`)
  }

  const reward: bigint = await staking.estimatedReward(value, lockDays)
  const reserve: bigint = await staking.rewardReserve()
  if (reserve < reward) {
    throw new Error(
      `Staking reward reserve too low (need ${formatUnits(reward, 18)} PAB-D). Admin must fundRewards on the Staking contract.`,
    )
  }
}

export async function unstakeTokens(staking: Contract, stakeId: number) {
  const tx = await staking.unstake(stakeId)
  const receipt = await tx.wait()
  return { hash: tx.hash as string, blockNumber: receipt?.blockNumber as number }
}

export async function claimVested(vesting: Contract) {
  const tx = await vesting.claim()
  const receipt = await tx.wait()
  return { hash: tx.hash as string, blockNumber: receipt?.blockNumber as number }
}

export { parseUnits, formatUnits }
