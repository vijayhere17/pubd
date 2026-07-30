<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Claim extends Model
{
    protected $fillable = [
        'user_id',
        'wallet_address',
        'type',
        'amount',
        'tx_hash',
        'status',
        'claimed_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:18',
            'claimed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
