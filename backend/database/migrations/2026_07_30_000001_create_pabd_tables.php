<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('wallet_address', 42)->nullable()->unique()->after('id');
            $table->boolean('is_admin')->default(false)->after('password');
            $table->timestamp('last_login_at')->nullable()->after('is_admin');
        });

        // Allow wallet-only users without email/password credentials.
        Schema::table('users', function (Blueprint $table) {
            $table->string('name')->nullable()->change();
            $table->string('email')->nullable()->change();
            $table->string('password')->nullable()->change();
        });

        Schema::create('sale_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('token_price', 18, 8)->default(0.10);
            $table->boolean('sale_active')->default(true);
            $table->timestamp('sale_start')->nullable();
            $table->timestamp('sale_end')->nullable();
            $table->decimal('min_buy', 36, 18)->default(10);
            $table->decimal('max_buy', 36, 18)->default(100000);
            $table->string('usdt_address', 42)->nullable();
            $table->string('treasury_wallet', 42)->nullable();
            $table->string('token_address', 42)->nullable();
            $table->string('sale_address', 42)->nullable();
            $table->string('staking_address', 42)->nullable();
            $table->string('vesting_address', 42)->nullable();
            $table->unsignedInteger('chain_id')->default(56);
            $table->string('rpc_url')->nullable();
            $table->string('explorer_url')->default('https://bscscan.com');
            $table->decimal('stake_apy_default', 8, 2)->default(12);
            $table->json('lock_periods')->nullable();
            $table->json('vesting_schedule')->nullable();
            $table->timestamps();
        });

        Schema::create('purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('wallet_address', 42)->index();
            $table->decimal('usdt_amount', 36, 18);
            $table->decimal('token_amount', 36, 18);
            $table->decimal('token_price', 18, 8);
            $table->string('tx_hash', 66)->unique();
            $table->string('status', 32)->default('pending')->index();
            $table->unsignedInteger('block_number')->nullable();
            $table->unsignedTinyInteger('confirmations')->default(0);
            $table->timestamp('purchased_at')->nullable();
            $table->timestamps();
        });

        Schema::create('stakes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('wallet_address', 42)->index();
            $table->unsignedBigInteger('onchain_stake_id')->nullable()->index();
            $table->decimal('amount', 36, 18);
            $table->unsignedInteger('lock_days');
            $table->decimal('apy', 8, 2);
            $table->decimal('estimated_reward', 36, 18)->default(0);
            $table->decimal('claimed_reward', 36, 18)->default(0);
            $table->string('tx_hash', 66)->unique();
            $table->string('unstake_tx_hash', 66)->nullable();
            $table->string('status', 32)->default('active')->index();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('wallet_address', 42)->index();
            $table->string('type', 32)->default('vesting');
            $table->decimal('amount', 36, 18);
            $table->string('tx_hash', 66)->unique();
            $table->string('status', 32)->default('pending')->index();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('wallet_address', 42)->index();
            $table->string('type', 32)->index();
            $table->decimal('amount', 36, 18)->default(0);
            $table->string('token_symbol', 16)->nullable();
            $table->string('tx_hash', 66)->unique();
            $table->string('status', 32)->default('pending')->index();
            $table->string('explorer_url')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamps();
        });

        Schema::create('blockchain_logs', function (Blueprint $table) {
            $table->id();
            $table->string('event', 64)->index();
            $table->string('contract', 42)->nullable();
            $table->string('tx_hash', 66)->nullable()->index();
            $table->string('wallet_address', 42)->nullable()->index();
            $table->json('payload')->nullable();
            $table->string('level', 16)->default('info');
            $table->timestamps();
        });

        Schema::create('auth_nonces', function (Blueprint $table) {
            $table->id();
            $table->string('wallet_address', 42)->index();
            $table->string('nonce', 64);
            $table->timestamp('expires_at');
            $table->timestamps();
            $table->unique(['wallet_address', 'nonce']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_nonces');
        Schema::dropIfExists('blockchain_logs');
        Schema::dropIfExists('wallet_transactions');
        Schema::dropIfExists('claims');
        Schema::dropIfExists('stakes');
        Schema::dropIfExists('purchases');
        Schema::dropIfExists('sale_settings');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['wallet_address', 'is_admin', 'last_login_at']);
        });
    }
};
