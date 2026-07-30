<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Claim;
use App\Models\Purchase;
use App\Models\Stake;
use App\Models\WalletTransaction;
use App\Services\PortfolioService;
use App\Services\TransactionService;
use Illuminate\Http\Request;

class TransactionController extends Controller
{
    public function __construct(
        private TransactionService $transactions,
        private PortfolioService $portfolio
    ) {}

    public function buy(Request $request)
    {
        $data = $request->validate([
            'usdt_amount' => ['required', 'numeric', 'gt:0'],
            'token_amount' => ['nullable', 'numeric', 'gt:0'],
            'token_price' => ['nullable', 'numeric', 'gt:0'],
            'tx_hash' => ['required', 'string'],
            'block_number' => ['nullable', 'integer'],
            'confirmations' => ['nullable', 'integer'],
            'status' => ['nullable', 'string'],
        ]);

        $purchase = $this->transactions->recordPurchase($request->user(), $data);

        return response()->json([
            'message' => 'Transaction Successful',
            'purchase' => $purchase,
            'dashboard' => $this->portfolio->forUser($request->user()),
        ], 201);
    }

    public function stake(Request $request)
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'lock_days' => ['required', 'integer', 'in:100,200,300,400,500'],
            'apy' => ['nullable', 'numeric'],
            'onchain_stake_id' => ['nullable', 'integer'],
            'tx_hash' => ['required', 'string'],
        ]);

        $stake = $this->transactions->recordStake($request->user(), $data);

        return response()->json([
            'message' => 'Transaction Successful',
            'stake' => $stake,
            'dashboard' => $this->portfolio->forUser($request->user()),
        ], 201);
    }

    public function claim(Request $request)
    {
        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'gt:0'],
            'type' => ['nullable', 'string'],
            'tx_hash' => ['required', 'string'],
        ]);

        $claim = $this->transactions->recordClaim($request->user(), $data);

        return response()->json([
            'message' => 'Transaction Successful',
            'claim' => $claim,
            'dashboard' => $this->portfolio->forUser($request->user()),
        ], 201);
    }

    public function history(Request $request)
    {
        $user = $request->user();
        $tab = $request->query('tab', 'all');

        $buys = Purchase::query()->where('user_id', $user->id)->latest()->get();
        $stakes = Stake::query()->where('user_id', $user->id)->latest()->get();
        $claims = Claim::query()->where('user_id', $user->id)->latest()->get();
        $wallet = WalletTransaction::query()->where('user_id', $user->id)->latest()->get();

        return response()->json([
            'buy' => $buys,
            'stake' => $stakes,
            'claim' => $claims,
            'wallet' => $wallet,
            'active_tab' => $tab,
        ]);
    }
}
