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
        $settings = static::query()->firstOrCreate([], [
            'token_price' => 0.10,
            'sale_active' => true,
            'sale_start' => now(),
            'sale_end' => now()->addYear(),
            'min_buy' => 10,
            'max_buy' => 100000,
            'chain_id' => (int) env('PABD_CHAIN_ID', 56),
            'explorer_url' => env('PABD_EXPLORER_URL', 'https://bscscan.com'),
            'stake_apy_default' => 12,
            'usdt_address' => env('PABD_USDT_ADDRESS', '0x55d398326f99059fF775485246999027B3197955'),
            'token_address' => env('PABD_TOKEN_ADDRESS'),
            'sale_address' => env('PABD_SALE_ADDRESS'),
            'staking_address' => env('PABD_STAKING_ADDRESS'),
            'vesting_address' => env('PABD_VESTING_ADDRESS'),
            'treasury_wallet' => env('PABD_TREASURY_WALLET'),
            'lock_periods' => [
                ['days' => 100, 'percent' => 8],
                ['days' => 200, 'percent' => 20],
                ['days' => 300, 'percent' => 30],
                ['days' => 400, 'percent' => 45],
                ['days' => 500, 'percent' => 60],
            ],
            'vesting_schedule' => [
                ['days' => 100, 'unlock_percent' => 8],
                ['days' => 200, 'unlock_percent' => 20],
                ['days' => 300, 'unlock_percent' => 30],
                ['days' => 400, 'unlock_percent' => 45],
                ['days' => 500, 'unlock_percent' => 60],
            ],
        ]);

        // Keep env-provided addresses in sync when DB fields are still empty.
        $fromEnv = array_filter([
            'usdt_address' => env('PABD_USDT_ADDRESS'),
            'token_address' => env('PABD_TOKEN_ADDRESS'),
            'sale_address' => env('PABD_SALE_ADDRESS'),
            'staking_address' => env('PABD_STAKING_ADDRESS'),
            'vesting_address' => env('PABD_VESTING_ADDRESS'),
            'treasury_wallet' => env('PABD_TREASURY_WALLET'),
        ]);

                // BSC USDT default so balances work before custom admin config.
        if (empty($settings->usdt_address)) {
            $settings->usdt_address = '0x55d398326f99059fF775485246999027B3197955';
        }

        foreach ($fromEnv as $key => $value) {
            if (empty($settings->{$key}) && ! empty($value)) {
                $settings->{$key} = $value;
            }
        }

        // Keep product stake bonus schedule in sync (100d=8% ... 500d=60%).
        $desiredPeriods = [
            ['days' => 100, 'percent' => 8],
            ['days' => 200, 'percent' => 20],
            ['days' => 300, 'percent' => 30],
            ['days' => 400, 'percent' => 45],
            ['days' => 500, 'percent' => 60],
        ];
        if (($settings->lock_periods[0]['percent'] ?? $settings->lock_periods[0]['apy'] ?? null) !== 8
            || count($settings->lock_periods ?? []) !== 5) {
            $settings->lock_periods = $desiredPeriods;
        }

        if ($settings->isDirty()) {
            $settings->save();
        }

        return $settings;
    }
}
