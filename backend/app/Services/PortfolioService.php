<?php

namespace App\Services;

use App\Models\Claim;
use App\Models\Purchase;
use App\Models\SaleSetting;
use App\Models\Stake;
use App\Models\User;
use Carbon\Carbon;

class PortfolioService
{
    public function forUser(User $user): array
    {
        $settings = SaleSetting::current();
        $price = (float) $settings->token_price;

        $purchases = Purchase::query()
            ->where('user_id', $user->id)
            ->where('status', 'confirmed')
            ->get();

        $totalPurchased = (float) $purchases->sum('token_amount');
        $firstPurchaseAt = $purchases->min('purchased_at') ?? $purchases->min('created_at');

        $stakes = Stake::query()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->get();

        $totalStaked = (float) $stakes->sum('amount');
        $estimatedRewards = (float) $stakes->sum('estimated_reward');

        $totalClaimed = (float) Claim::query()
            ->where('user_id', $user->id)
            ->where('status', 'confirmed')
            ->sum('amount');

        $vesting = $this->computeVesting(
            $totalPurchased,
            $totalClaimed,
            $firstPurchaseAt ? Carbon::parse($firstPurchaseAt) : null,
            $settings->vesting_schedule ?? []
        );

        // Stakeable allocation follows purchased inventory minus active stakes (matches product flow).
        $available = max(0, $totalPurchased - $totalStaked);

        return [
            'wallet_address' => $user->wallet_address,
            'token_price' => $price,
            'total_purchased' => $totalPurchased,
            'total_staked' => $totalStaked,
            'available_tokens' => $available,
            'locked_tokens' => $vesting['locked'],
            'unlocked_tokens' => $vesting['unlocked'],
            'claimable_tokens' => $vesting['claimable'],
            'total_claimed' => $totalClaimed,
            'portfolio_value' => round($totalPurchased * $price, 4),
            'estimated_rewards' => $estimatedRewards,
            'next_unlock_date' => $vesting['next_unlock_date'],
            'next_unlock_percent' => $vesting['next_unlock_percent'],
            'vesting_progress' => $vesting['progress'],
            'active_stakes' => $stakes->count(),
            'settings' => [
                'sale_active' => $settings->sale_active,
                'min_buy' => (float) $settings->min_buy,
                'max_buy' => (float) $settings->max_buy,
                'usdt_address' => $settings->usdt_address,
                'token_address' => $settings->token_address,
                'sale_address' => $settings->sale_address,
                'staking_address' => $settings->staking_address,
                'vesting_address' => $settings->vesting_address,
                'treasury_wallet' => $settings->treasury_wallet,
                'chain_id' => $settings->chain_id,
                'explorer_url' => $settings->explorer_url,
                'lock_periods' => $settings->lock_periods,
                'vesting_schedule' => $settings->vesting_schedule,
            ],
        ];
    }

    public function computeVesting(float $purchased, float $claimed, ?Carbon $start, array $schedule): array
    {
        if ($purchased <= 0 || ! $start) {
            return [
                'locked' => 0,
                'unlocked' => 0,
                'claimable' => 0,
                'next_unlock_date' => null,
                'next_unlock_percent' => null,
                'progress' => 0,
            ];
        }

        $daysElapsed = $start->diffInDays(now());
        usort($schedule, fn ($a, $b) => ($a['days'] ?? 0) <=> ($b['days'] ?? 0));

        $unlockPercent = 0;
        $next = null;
        foreach ($schedule as $row) {
            $days = (int) ($row['days'] ?? 0);
            $pct = (float) ($row['unlock_percent'] ?? 0);
            if ($daysElapsed >= $days) {
                $unlockPercent = $pct;
            } elseif ($next === null) {
                $next = $row;
            }
        }

        $unlocked = round($purchased * ($unlockPercent / 100), 8);
        $locked = max(0, round($purchased - $unlocked, 8));
        $claimable = max(0, round($unlocked - $claimed, 8));

        $nextDate = null;
        $nextPct = null;
        if ($next) {
            $nextDate = $start->copy()->addDays((int) $next['days'])->toIso8601String();
            $nextPct = (float) ($next['unlock_percent'] ?? 0);
        }

        return [
            'locked' => $locked,
            'unlocked' => $unlocked,
            'claimable' => $claimable,
            'next_unlock_date' => $nextDate,
            'next_unlock_percent' => $nextPct,
            'progress' => min(100, $unlockPercent),
        ];
    }
}
