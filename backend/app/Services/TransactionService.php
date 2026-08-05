<?php

namespace App\Services;

use App\Models\BlockchainLog;
use App\Models\Claim;
use App\Models\Purchase;
use App\Models\SaleSetting;
use App\Models\Stake;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TransactionService
{
    public function __construct(
        private PortfolioService $portfolio,
        private BlockchainVerifyService $chain,
    ) {}

    public function recordPurchase(User $user, array $data): Purchase
    {
        $settings = SaleSetting::current();
        $this->assertSaleConfigured($settings);

        $txHash = strtolower($data['tx_hash']);
        $this->assertUniqueHash($txHash);

        $usdt = (float) $data['usdt_amount'];
        $price = (float) ($data['token_price'] ?? $settings->token_price);
        if ($usdt < (float) $settings->min_buy || $usdt > (float) $settings->max_buy) {
            throw ValidationException::withMessages(['usdt_amount' => 'Amount outside allowed buy range.']);
        }

        if (! $settings->sale_active) {
            throw ValidationException::withMessages(['sale' => 'Sale is paused by admin.']);
        }

        // Only record history after confirmed success on the configured Sale contract.
        $receipt = $this->chain->assertSuccessfulTx(
            $txHash,
            $settings->sale_address,
            $user->wallet_address,
            (int) ($settings->chain_id ?: 56)
        );

        $tokens = (float) ($data['token_amount'] ?? ($price > 0 ? $usdt / $price : 0));

        return DB::transaction(function () use ($user, $data, $txHash, $usdt, $tokens, $price, $settings, $receipt) {
            $purchase = Purchase::query()->create([
                'user_id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'usdt_amount' => $usdt,
                'token_amount' => $tokens,
                'token_price' => $price,
                'tx_hash' => $txHash,
                'status' => 'confirmed',
                'block_number' => $data['block_number'] ?? $receipt['blockNumber'],
                'confirmations' => $data['confirmations'] ?? 1,
                'purchased_at' => now(),
            ]);

            $this->logWalletTx($user, 'buy', $tokens, 'PAB-D', $txHash, $settings, [
                'usdt_amount' => $usdt,
                'token_price' => $price,
            ]);

            BlockchainLog::query()->create([
                'event' => 'TokensPurchased',
                'contract' => $settings->sale_address,
                'tx_hash' => $txHash,
                'wallet_address' => $user->wallet_address,
                'payload' => $purchase->toArray(),
            ]);

            return $purchase;
        });
    }

    public function recordStake(User $user, array $data): Stake
    {
        $settings = SaleSetting::current();
        if (! $this->chain->isValidAddress($settings->staking_address) || ! $this->chain->isValidAddress($settings->token_address)) {
            throw ValidationException::withMessages([
                'staking' => 'Admin must set Staking + Token addresses before stake is allowed.',
            ]);
        }

        $txHash = strtolower($data['tx_hash']);
        $this->assertUniqueHash($txHash);

        $amount = (float) $data['amount'];
        $lockDays = (int) $data['lock_days'];
        $minStakeUsd = $settings->minStakeUsd();
        $minStakePabd = $settings->minStakePabd();
        $price = (float) $settings->token_price;
        $stakeUsd = $price > 0 ? round($amount * $price, 8) : 0;

        if ($amount + 1e-12 < $minStakePabd || $stakeUsd + 1e-12 < $minStakeUsd) {
            throw ValidationException::withMessages([
                'amount' => sprintf(
                    'Minimum stake is $%s (≈ %s PAB-D at $%s each).',
                    rtrim(rtrim(number_format($minStakeUsd, 2, '.', ''), '0'), '.') ?: '0',
                    rtrim(rtrim(number_format($minStakePabd, 8, '.', ''), '0'), '.') ?: '0',
                    rtrim(rtrim(number_format($price, 8, '.', ''), '0'), '.') ?: '0'
                ),
            ]);
        }
        $periods = collect($settings->lock_periods ?? []);
        $period = $periods->firstWhere('days', $lockDays);
        $bonusPercent = (float) ($data['apy'] ?? ($period['percent'] ?? $period['apy'] ?? 8));
        // Flat period bonus: stake amount × percent (e.g. 5000 × 8% => 400)
        $estimated = round($amount * ($bonusPercent / 100), 8);

        $this->chain->assertStakeTokenTransfer(
            $txHash,
            $settings->staking_address,
            $settings->token_address,
            $user->wallet_address,
            (int) ($settings->chain_id ?: 56)
        );

        return DB::transaction(function () use ($user, $data, $txHash, $amount, $lockDays, $bonusPercent, $estimated, $settings) {
            $stake = Stake::query()->create([
                'user_id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'onchain_stake_id' => $data['onchain_stake_id'] ?? null,
                'amount' => $amount,
                'lock_days' => $lockDays,
                'apy' => $bonusPercent,
                'estimated_reward' => $estimated,
                'tx_hash' => $txHash,
                'status' => 'active',
                'starts_at' => now(),
                'ends_at' => now()->addDays($lockDays),
            ]);

            $this->logWalletTx($user, 'stake', $amount, 'PAB-D', $txHash, $settings, [
                'lock_days' => $lockDays,
                'bonus_percent' => $bonusPercent,
                'total_return' => $amount + $estimated,
            ]);

            BlockchainLog::query()->create([
                'event' => 'Staked',
                'contract' => $settings->staking_address,
                'tx_hash' => $txHash,
                'wallet_address' => $user->wallet_address,
                'payload' => $stake->toArray(),
            ]);

            return $stake;
        });
    }

    public function recordClaim(User $user, array $data): Claim
    {
        $settings = SaleSetting::current();
        $txHash = strtolower($data['tx_hash']);
        $this->assertUniqueHash($txHash);

        $stake = null;
        if (! empty($data['stake_id'])) {
            $stake = Stake::query()
                ->where('user_id', $user->id)
                ->where('id', (int) $data['stake_id'])
                ->where('status', 'active')
                ->first();
            if (! $stake) {
                throw ValidationException::withMessages(['stake_id' => 'Active stake not found.']);
            }
            if ($stake->ends_at && $stake->ends_at->isFuture()) {
                throw ValidationException::withMessages(['stake_id' => 'Stake is still locked.']);
            }
        }

        $amount = (float) ($data['amount'] ?? 0);
        if ($stake && $amount <= 0) {
            $amount = (float) $stake->amount + (float) $stake->estimated_reward;
        }
        if ($amount <= 0) {
            $portfolio = $this->portfolio->forUser($user);
            $amount = (float) ($portfolio['claimable_tokens'] ?? 0);
        }
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'No claimable tokens.']);
        }

        return DB::transaction(function () use ($user, $data, $txHash, $amount, $settings, $stake) {
            if ($stake) {
                $stake->update([
                    'status' => 'claimed',
                    'claimed_reward' => $stake->estimated_reward,
                    'unstake_tx_hash' => $txHash,
                ]);
            }

            $claim = Claim::query()->create([
                'user_id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'type' => $data['type'] ?? ($stake ? 'stake' : 'vesting'),
                'amount' => $amount,
                'tx_hash' => $txHash,
                'status' => 'confirmed',
                'claimed_at' => now(),
            ]);

            $this->logWalletTx($user, 'claim', $amount, 'PAB-D', $txHash, $settings, [
                'stake_id' => $stake?->id,
                'onchain_stake_id' => $data['onchain_stake_id'] ?? $stake?->onchain_stake_id,
            ]);

            BlockchainLog::query()->create([
                'event' => 'TokensClaimed',
                'contract' => $settings->staking_address ?: $settings->vesting_address,
                'tx_hash' => $txHash,
                'wallet_address' => $user->wallet_address,
                'payload' => $claim->toArray(),
            ]);

            return $claim;
        });
    }

    private function assertSaleConfigured(SaleSetting $settings): void
    {
        if (! $this->chain->isValidAddress($settings->sale_address)) {
            throw ValidationException::withMessages([
                'sale_address' => 'Admin must set Sale Address before buy is allowed. No payment or history will be created.',
            ]);
        }
        if (! $this->chain->isValidAddress($settings->usdt_address)) {
            throw ValidationException::withMessages([
                'usdt_address' => 'Admin must set USDT Address before buy is allowed.',
            ]);
        }
        if (! $this->chain->isValidAddress($settings->token_address)) {
            throw ValidationException::withMessages([
                'token_address' => 'Admin must set Token Address before buy is allowed.',
            ]);
        }
    }

    private function assertUniqueHash(string $txHash): void
    {
        if (! preg_match('/^0x[a-f0-9]{64}$/', $txHash)) {
            throw ValidationException::withMessages(['tx_hash' => 'Invalid transaction hash.']);
        }

        $exists = WalletTransaction::query()->where('tx_hash', $txHash)->exists()
            || Purchase::query()->where('tx_hash', $txHash)->exists()
            || Stake::query()->where('tx_hash', $txHash)->exists()
            || Claim::query()->where('tx_hash', $txHash)->exists();

        if ($exists) {
            throw ValidationException::withMessages(['tx_hash' => 'Duplicate transaction.']);
        }
    }

    private function logWalletTx(
        User $user,
        string $type,
        float $amount,
        string $symbol,
        string $txHash,
        SaleSetting $settings,
        array $meta = []
    ): void {
        WalletTransaction::query()->create([
            'user_id' => $user->id,
            'wallet_address' => $user->wallet_address,
            'type' => $type,
            'amount' => $amount,
            'token_symbol' => $symbol,
            'tx_hash' => $txHash,
            'status' => 'confirmed',
            'explorer_url' => rtrim($settings->explorer_url ?? 'https://bscscan.com', '/').'/tx/'.$txHash,
            'meta' => $meta,
            'occurred_at' => now(),
        ]);
    }
}
