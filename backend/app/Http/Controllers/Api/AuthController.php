<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WalletAuthService;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private WalletAuthService $auth) {}

    public function nonce(Request $request)
    {
        $data = $request->validate([
            'wallet' => ['required', 'string'],
        ]);

        return response()->json($this->auth->issueNonce($data['wallet']));
    }

    public function walletLogin(Request $request)
    {
        $data = $request->validate([
            'wallet' => ['required', 'string'],
            'signature' => ['nullable', 'string'],
            'nonce' => ['nullable', 'string'],
        ]);

        if (! empty($data['signature'])) {
            $result = $this->auth->verifyAndLogin(
                $data['wallet'],
                $data['signature'],
                $data['nonce'] ?? null
            );
        } else {
            // Auto-create user on first connect when signature omitted (frontend can upgrade to SIWE).
            $result = $this->auth->loginWithoutSignature($data['wallet']);
        }

        return response()->json($result);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'wallet_address' => $user->wallet_address,
            'is_admin' => (bool) $user->is_admin,
            'name' => $user->name,
            'last_login_at' => $user->last_login_at,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }
}
