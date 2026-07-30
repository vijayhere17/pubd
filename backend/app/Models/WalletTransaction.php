<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WalletTransaction extends Model
{
    protected $fillable = [
        'user_id',
        'wallet_address',
        'type',
        'amount',
        'token_symbol',
        'tx_hash',
        'status',
        'explorer_url',
        'meta',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:18',
            'meta' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
