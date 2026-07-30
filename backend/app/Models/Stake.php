<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Stake extends Model
{
    protected $fillable = [
        'user_id',
        'wallet_address',
        'onchain_stake_id',
        'amount',
        'lock_days',
        'apy',
        'estimated_reward',
        'claimed_reward',
        'tx_hash',
        'unstake_tx_hash',
        'status',
        'starts_at',
        'ends_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:18',
            'apy' => 'decimal:2',
            'estimated_reward' => 'decimal:18',
            'claimed_reward' => 'decimal:18',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
