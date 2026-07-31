<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SaleSetting;
use App\Services\PortfolioService;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private PortfolioService $portfolio) {}

    public function show(Request $request)
    {
        return response()->json($this->portfolio->forUser($request->user()));
    }

    public function publicConfig()
    {
        $settings = SaleSetting::current();

        return response()->json([
            'token_price' => (float) $settings->token_price,
            'sale_active' => $settings->sale_active,
            'sale_start' => $settings->sale_start,
            'sale_end' => $settings->sale_end,
            'min_buy' => (float) $settings->min_buy,
            'max_buy' => (float) $settings->max_buy,
            'min_stake' => 5000,
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
        ]);
    }
}
