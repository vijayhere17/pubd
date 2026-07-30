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
    public function __construct(private PortfolioService $portfolio) {}

    public function recordPurchase(User $user, array $data): Purchase
    {
        $settings = SaleSetting::current();
        $txHash = strtolower($data['tx_hash']);
        $this->assertUniqueHash($txHash);

        $usdt = (float) $data['usdt_amount'];
        $price = (float) ($data['token_price'] ?? $settings->token_price);
        if ($usdt < (float) $settings->min_buy || $usdt > (float) $settings->max_buy) {
            throw ValidationException::withMessages(['usdt_amount' => 'Amount outside allowed buy range.']);
        }

        $tokens = (float) ($data['token_amount'] ?? ($price > 0 ? $usdt / $price : 0));

        return DB::transaction(function () use ($user, $data, $txHash, $usdt, $tokens, $price, $settings) {
            $purchase = Purchase::query()->create([
                'user_id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'usdt_amount' => $usdt,
                'token_amount' => $tokens,
                'token_price' => $price,
                'tx_hash' => $txHash,
                'status' => $data['status'] ?? 'confirmed',
                'block_number' => $data['block_number'] ?? null,
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
        $txHash = strtolower($data['tx_hash']);
        $this->assertUniqueHash($txHash);

        $amount = (float) $data['amount'];
        $lockDays = (int) $data['lock_days'];
        $periods = collect($settings->lock_periods ?? []);
        $period = $periods->firstWhere('days', $lockDays);
        $apy = (float) ($data['apy'] ?? ($period['apy'] ?? $settings->stake_apy_default));
        $estimated = round($amount * ($apy / 100) * ($lockDays / 365), 8);

        return DB::transaction(function () use ($user, $data, $txHash, $amount, $lockDays, $apy, $estimated, $settings) {
            $stake = Stake::query()->create([
                'user_id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'onchain_stake_id' => $data['onchain_stake_id'] ?? null,
                'amount' => $amount,
                'lock_days' => $lockDays,
                'apy' => $apy,
                'estimated_reward' => $estimated,
                'tx_hash' => $txHash,
                'status' => 'active',
                'starts_at' => now(),
                'ends_at' => now()->addDays($lockDays),
            ]);

            $this->logWalletTx($user, 'stake', $amount, 'PAB-D', $txHash, $settings, [
                'lock_days' => $lockDays,
                'apy' => $apy,
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

        $portfolio = $this->portfolio->forUser($user);
        $amount = (float) ($data['amount'] ?? $portfolio['claimable_tokens']);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'No claimable tokens.']);
        }

        return DB::transaction(function () use ($user, $data, $txHash, $amount, $settings) {
            $claim = Claim::query()->create([
                'user_id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'type' => $data['type'] ?? 'vesting',
                'amount' => $amount,
                'tx_hash' => $txHash,
                'status' => 'confirmed',
                'claimed_at' => now(),
            ]);

            $this->logWalletTx($user, 'claim', $amount, 'PAB-D', $txHash, $settings);

            BlockchainLog::query()->create([
                'event' => 'TokensClaimed',
                'contract' => $settings->vesting_address,
                'tx_hash' => $txHash,
                'wallet_address' => $user->wallet_address,
                'payload' => $claim->toArray(),
            ]);

            return $claim;
        });
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
