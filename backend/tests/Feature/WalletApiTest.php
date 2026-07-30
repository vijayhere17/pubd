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
