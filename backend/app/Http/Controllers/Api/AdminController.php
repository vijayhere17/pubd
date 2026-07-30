<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BlockchainLog;
use App\Models\Claim;
use App\Models\Purchase;
use App\Models\SaleSetting;
use App\Models\Stake;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminController extends Controller
{
    public function dashboard()
    {
        return response()->json([
            'investors' => User::query()->whereNotNull('wallet_address')->count(),
            'total_purchased_tokens' => (float) Purchase::query()->where('status', 'confirmed')->sum('token_amount'),
            'total_raised_usdt' => (float) Purchase::query()->where('status', 'confirmed')->sum('usdt_amount'),
            'active_stakers' => Stake::query()->where('status', 'active')->distinct('user_id')->count('user_id'),
            'total_staked' => (float) Stake::query()->where('status', 'active')->sum('amount'),
            'total_claimed' => (float) Claim::query()->where('status', 'confirmed')->sum('amount'),
            'settings' => SaleSetting::current(),
        ]);
    }

    public function settings()
    {
        return response()->json(SaleSetting::current());
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'token_price' => ['nullable', 'numeric', 'gt:0'],
            'sale_active' => ['nullable', 'boolean'],
            'sale_start' => ['nullable', 'date'],
            'sale_end' => ['nullable', 'date'],
            'min_buy' => ['nullable', 'numeric', 'gt:0'],
            'max_buy' => ['nullable', 'numeric', 'gt:0'],
            'usdt_address' => ['nullable', 'string'],
            'treasury_wallet' => ['nullable', 'string'],
            'token_address' => ['nullable', 'string'],
            'sale_address' => ['nullable', 'string'],
            'staking_address' => ['nullable', 'string'],
            'vesting_address' => ['nullable', 'string'],
            'chain_id' => ['nullable', 'integer'],
            'rpc_url' => ['nullable', 'string'],
            'explorer_url' => ['nullable', 'string'],
            'stake_apy_default' => ['nullable', 'numeric'],
            'lock_periods' => ['nullable', 'array'],
            'vesting_schedule' => ['nullable', 'array'],
        ]);

        $settings = SaleSetting::current();
        $settings->fill($data)->save();

        return response()->json($settings->fresh());
    }

    public function pauseSale()
    {
        $settings = SaleSetting::current();
        $settings->sale_active = false;
        $settings->save();

        return response()->json(['sale_active' => false]);
    }

    public function resumeSale()
    {
        $settings = SaleSetting::current();
        $settings->sale_active = true;
        $settings->save();

        return response()->json(['sale_active' => true]);
    }

    public function investors()
    {
        $investors = User::query()
            ->whereNotNull('wallet_address')
            ->withSum(['purchases as purchased_tokens' => fn ($q) => $q->where('status', 'confirmed')], 'token_amount')
            ->withSum(['purchases as spent_usdt' => fn ($q) => $q->where('status', 'confirmed')], 'usdt_amount')
            ->orderByDesc('id')
            ->paginate(50);

        return response()->json($investors);
    }

    public function stakers()
    {
        return response()->json(
            Stake::query()->with('user:id,wallet_address')->latest()->paginate(50)
        );
    }

    public function claims()
    {
        return response()->json(
            Claim::query()->with('user:id,wallet_address')->latest()->paginate(50)
        );
    }

    public function logs()
    {
        return response()->json(
            BlockchainLog::query()->latest()->paginate(100)
        );
    }

    public function export(Request $request): StreamedResponse
    {
        $type = $request->query('type', 'purchases');

        return response()->streamDownload(function () use ($type) {
            $out = fopen('php://output', 'w');
            if ($type === 'stakes') {
                fputcsv($out, ['id', 'wallet', 'amount', 'lock_days', 'apy', 'status', 'tx_hash', 'created_at']);
                Stake::query()->orderBy('id')->chunk(200, function ($rows) use ($out) {
                    foreach ($rows as $row) {
                        fputcsv($out, [$row->id, $row->wallet_address, $row->amount, $row->lock_days, $row->apy, $row->status, $row->tx_hash, $row->created_at]);
                    }
                });
            } elseif ($type === 'claims') {
                fputcsv($out, ['id', 'wallet', 'amount', 'type', 'status', 'tx_hash', 'created_at']);
                Claim::query()->orderBy('id')->chunk(200, function ($rows) use ($out) {
                    foreach ($rows as $row) {
                        fputcsv($out, [$row->id, $row->wallet_address, $row->amount, $row->type, $row->status, $row->tx_hash, $row->created_at]);
                    }
                });
            } else {
                fputcsv($out, ['id', 'wallet', 'usdt_amount', 'token_amount', 'price', 'status', 'tx_hash', 'created_at']);
                Purchase::query()->orderBy('id')->chunk(200, function ($rows) use ($out) {
                    foreach ($rows as $row) {
                        fputcsv($out, [$row->id, $row->wallet_address, $row->usdt_amount, $row->token_amount, $row->token_price, $row->status, $row->tx_hash, $row->created_at]);
                    }
                });
            }
            fclose($out);
        }, "pabd-{$type}.csv", [
            'Content-Type' => 'text/csv',
        ]);
    }
}
