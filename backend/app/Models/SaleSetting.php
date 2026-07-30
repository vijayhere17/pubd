<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleSetting extends Model
{
    protected $fillable = [
        'token_price',
        'sale_active',
        'sale_start',
        'sale_end',
        'min_buy',
        'max_buy',
        'usdt_address',
        'treasury_wallet',
        'token_address',
        'sale_address',
        'staking_address',
        'vesting_address',
        'chain_id',
        'rpc_url',
        'explorer_url',
        'stake_apy_default',
        'lock_periods',
        'vesting_schedule',
    ];

    protected function casts(): array
    {
        return [
            'token_price' => 'decimal:8',
            'sale_active' => 'boolean',
            'sale_start' => 'datetime',
            'sale_end' => 'datetime',
            'min_buy' => 'decimal:18',
            'max_buy' => 'decimal:18',
            'stake_apy_default' => 'decimal:2',
            'lock_periods' => 'array',
            'vesting_schedule' => 'array',
        ];
    }

    public static function current(): self
    {
        return static::query()->firstOrCreate([], [
            'token_price' => 0.10,
            'sale_active' => true,
            'sale_start' => now(),
            'sale_end' => now()->addYear(),
            'min_buy' => 10,
            'max_buy' => 100000,
            'chain_id' => 56,
            'explorer_url' => 'https://bscscan.com',
            'stake_apy_default' => 12,
            'lock_periods' => [
                ['days' => 100, 'apy' => 8],
                ['days' => 200, 'apy' => 10],
                ['days' => 300, 'apy' => 12],
                ['days' => 400, 'apy' => 15],
                ['days' => 500, 'apy' => 18],
            ],
            'vesting_schedule' => [
                ['days' => 100, 'unlock_percent' => 8],
                ['days' => 200, 'unlock_percent' => 20],
                ['days' => 300, 'unlock_percent' => 30],
                ['days' => 400, 'unlock_percent' => 45],
                ['days' => 500, 'unlock_percent' => 60],
            ],
        ]);
    }
}
