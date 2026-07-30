<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BlockchainLog extends Model
{
    protected $fillable = [
        'event',
        'contract',
        'tx_hash',
        'wallet_address',
        'payload',
        'level',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }
}
