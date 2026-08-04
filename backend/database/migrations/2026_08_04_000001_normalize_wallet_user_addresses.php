<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Legacy rows may store checksummed wallets; login always uses lowercase.
        // MySQL email uniqueness is case-insensitive, which caused duplicate inserts.
        DB::table('users')
            ->whereNotNull('wallet_address')
            ->orderBy('id')
            ->each(function ($user) {
                $wallet = strtolower((string) $user->wallet_address);
                $email = str_ends_with(strtolower((string) $user->email), '@wallet.pabd.local')
                    ? $wallet.'@wallet.pabd.local'
                    : $user->email;

                if ($user->wallet_address === $wallet && $user->email === $email) {
                    return;
                }

                DB::table('users')->where('id', $user->id)->update([
                    'wallet_address' => $wallet,
                    'email' => $email,
                    'updated_at' => now(),
                ]);
            });
    }

    public function down(): void
    {
        // Irreversible normalization.
    }
};
