<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class BlockchainVerifyService
{
    public function rpcUrl(int $chainId = 56): string
    {
        $fromEnv = env('PABD_RPC_URL');
        if (! empty($fromEnv)) {
            return (string) $fromEnv;
        }

        return $chainId === 97
            ? 'https://data-seed-prebsc-1-s1.binance.org:8545/'
            : 'https://bsc-dataseed.binance.org/';
    }

    /**
     * @return array{status:string,blockNumber:?int,to:?string,from:?string}
     */
    public function getReceipt(string $txHash, int $chainId = 56): array
    {
        $txHash = strtolower($txHash);
        if (! preg_match('/^0x[a-f0-9]{64}$/', $txHash)) {
            throw ValidationException::withMessages(['tx_hash' => 'Invalid transaction hash.']);
        }

        $response = Http::timeout(20)->post($this->rpcUrl($chainId), [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => 'eth_getTransactionReceipt',
            'params' => [$txHash],
        ]);

        if (! $response->ok()) {
            throw ValidationException::withMessages(['tx_hash' => 'Unable to verify transaction on RPC.']);
        }

        $result = $response->json('result');
        if (! is_array($result)) {
            throw ValidationException::withMessages(['tx_hash' => 'Transaction not found on chain yet.']);
        }

        $statusHex = strtolower((string) ($result['status'] ?? '0x0'));
        $status = ($statusHex === '0x1' || $statusHex === '1') ? 'success' : 'failed';

        return [
            'status' => $status,
            'blockNumber' => isset($result['blockNumber']) ? hexdec($result['blockNumber']) : null,
            'to' => isset($result['to']) ? strtolower((string) $result['to']) : null,
            'from' => isset($result['from']) ? strtolower((string) $result['from']) : null,
        ];
    }

    public function assertSuccessfulTx(string $txHash, ?string $expectedTo, ?string $expectedFrom, int $chainId = 56): array
    {
        $receipt = $this->getReceipt($txHash, $chainId);

        if ($receipt['status'] !== 'success') {
            throw ValidationException::withMessages([
                'tx_hash' => 'On-chain transaction failed. History was not recorded.',
            ]);
        }

        if ($expectedTo && $receipt['to'] && strtolower($expectedTo) !== $receipt['to']) {
            throw ValidationException::withMessages([
                'tx_hash' => 'Transaction was not sent to the configured Sale contract.',
            ]);
        }

        if ($expectedFrom && $receipt['from'] && strtolower($expectedFrom) !== $receipt['from']) {
            throw ValidationException::withMessages([
                'tx_hash' => 'Transaction sender does not match connected wallet.',
            ]);
        }

        return $receipt;
    }

    public function isValidAddress(?string $address): bool
    {
        return is_string($address) && (bool) preg_match('/^0x[a-fA-F0-9]{40}$/', $address);
    }
}
