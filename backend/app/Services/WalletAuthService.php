<?php

namespace App\Services;

use App\Models\AuthNonce;
use App\Models\User;
use Elliptic\EC;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use kornrunner\Keccak;

class WalletAuthService
{
    public function issueNonce(string $wallet): array
    {
        $wallet = strtolower($wallet);
        $this->assertAddress($wallet);

        $nonce = Str::random(32);
        AuthNonce::query()->where('wallet_address', $wallet)->delete();
        AuthNonce::query()->create([
            'wallet_address' => $wallet,
            'nonce' => $nonce,
            'expires_at' => now()->addMinutes(10),
        ]);

        $message = $this->buildMessage($wallet, $nonce);

        return compact('wallet', 'nonce', 'message');
    }

    public function verifyAndLogin(string $wallet, string $signature, ?string $nonce = null): array
    {
        $wallet = strtolower($wallet);
        $this->assertAddress($wallet);

        $record = AuthNonce::query()
            ->where('wallet_address', $wallet)
            ->when($nonce, fn ($q) => $q->where('nonce', $nonce))
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (! $record) {
            throw ValidationException::withMessages(['nonce' => 'Nonce expired or missing. Request a new one.']);
        }

        $message = $this->buildMessage($wallet, $record->nonce);
        if (! $this->verifySignature($wallet, $message, $signature)) {
            throw ValidationException::withMessages(['signature' => 'Invalid wallet signature.']);
        }

        $record->delete();

        return $this->issueToken($wallet);
    }

    public function loginWithoutSignature(string $wallet): array
    {
        $wallet = strtolower($wallet);
        $this->assertAddress($wallet);

        return $this->issueToken($wallet);
    }

    public function buildMessage(string $wallet, string $nonce): string
    {
        return "PAB-D Wallet Login\nWallet: {$wallet}\nNonce: {$nonce}";
    }

    public function verifySignature(string $wallet, string $message, string $signature): bool
    {
        $wallet = strtolower($wallet);
        $signature = strtolower(str_replace('0x', '', $signature));
        if (strlen($signature) !== 130) {
            return false;
        }

        $r = substr($signature, 0, 64);
        $s = substr($signature, 64, 64);
        $v = hexdec(substr($signature, 128, 2));
        if ($v >= 27) {
            $v -= 27;
        }
        if ($v !== 0 && $v !== 1) {
            return false;
        }

        $prefix = "\x19Ethereum Signed Message:\n".strlen($message).$message;
        $hash = Keccak::hash($prefix, 256);

        try {
            $ec = new EC('secp256k1');
            $publicKey = $ec->recoverPubKey($hash, ['r' => $r, 's' => $s], $v);
            $publicKeyHex = $publicKey->encode('hex');
            $publicKeyBin = hex2bin(substr($publicKeyHex, 2));
            $address = '0x'.substr(Keccak::hash($publicKeyBin, 256), -40);

            return strtolower($address) === $wallet;
        } catch (\Throwable) {
            return false;
        }
    }

    private function issueToken(string $wallet): array
    {
        $user = User::query()->firstOrCreate(
            ['wallet_address' => $wallet],
            [
                'name' => 'Wallet '.substr($wallet, 0, 6).'…'.substr($wallet, -4),
                'email' => $wallet.'@wallet.pabd.local',
                'password' => null,
            ]
        );

        $user->forceFill(['last_login_at' => now()])->save();

        return [
            'token' => $user->createToken('wallet')->plainTextToken,
            'user' => [
                'id' => $user->id,
                'wallet_address' => $user->wallet_address,
                'is_admin' => (bool) $user->is_admin,
                'name' => $user->name,
            ],
        ];
    }

    private function assertAddress(string $wallet): void
    {
        if (! preg_match('/^0x[a-f0-9]{40}$/', $wallet)) {
            throw ValidationException::withMessages(['wallet' => 'Invalid wallet address.']);
        }
    }
}
