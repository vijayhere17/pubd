<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WalletApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_wallet_login_creates_user_and_returns_token(): void
    {
        $wallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

        $response = $this->postJson('/api/wallet-login', [
            'wallet' => $wallet,
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'wallet_address', 'is_admin']]);

        $this->assertDatabaseHas('users', [
            'wallet_address' => $wallet,
        ]);
    }

    public function test_wallet_login_reuses_checksummed_user_without_duplicate_email(): void
    {
        $checksummed = '0xA25BfE01Aa5Ef38A60a56D30FdF2B431aB80921F';
        $lower = strtolower($checksummed);

        // Simulate a legacy row created before wallet addresses were lowercased.
        \App\Models\User::query()->create([
            'wallet_address' => $checksummed,
            'name' => 'Legacy Wallet',
            'email' => $checksummed.'@wallet.pabd.local',
            'password' => null,
        ]);

        $response = $this->postJson('/api/wallet-login', [
            'wallet' => $lower,
        ]);

        $response->assertOk()
            ->assertJsonPath('user.wallet_address', $lower);

        $this->assertSame(1, \App\Models\User::query()->count());
        $this->assertDatabaseHas('users', [
            'wallet_address' => $lower,
            'email' => $lower.'@wallet.pabd.local',
        ]);
    }

    public function test_buy_persists_and_rejects_duplicate_hash(): void
    {
        $login = $this->postJson('/api/wallet-login', [
            'wallet' => '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ])->json();

        $token = $login['token'];
        $hash = '0x1111111111111111111111111111111111111111111111111111111111111111';

        $this->withToken($token)
            ->postJson('/api/transactions/buy', [
                'usdt_amount' => 100,
                'tx_hash' => $hash,
            ])
            ->assertCreated()
            ->assertJsonPath('message', 'Transaction Successful');

        $this->withToken($token)
            ->postJson('/api/transactions/buy', [
                'usdt_amount' => 100,
                'tx_hash' => $hash,
            ])
            ->assertStatus(422);
    }

    public function test_public_config_available(): void
    {
        $this->getJson('/api/config')->assertOk()->assertJsonStructure(['token_price', 'chain_id']);
    }
}
