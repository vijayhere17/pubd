<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Purchase extends Model
{
    protected $fillable = [
        'user_id',
        'wallet_address',
        'usdt_amount',
        'token_amount',
        'token_price',
        'tx_hash',
        'status',
        'block_number',
        'confirmations',
        'purchased_at',
    ];

    protected function casts(): array
    {
        return [
            'usdt_amount' => 'decimal:18',
            'token_amount' => 'decimal:18',
            'token_price' => 'decimal:8',
            'purchased_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
