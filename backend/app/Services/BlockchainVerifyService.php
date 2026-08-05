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
                'tx_hash' => 'Transaction was not sent to the configured contract.',
            ]);
        }

        if ($expectedFrom && $receipt['from'] && strtolower($expectedFrom) !== $receipt['from']) {
            throw ValidationException::withMessages([
                'tx_hash' => 'Transaction sender does not match connected wallet.',
            ]);
        }

        return $receipt;
    }

    /**
     * Require an ERC-20 Transfer of PAB-D from the staker into the Staking contract.
     * Stake principal is locked in Staking — it does NOT go to the admin wallet.
     */
    public function assertStakeTokenTransfer(
        string $txHash,
        string $stakingAddress,
        string $tokenAddress,
        string $fromAddress,
        int $chainId = 56
    ): array {
        $receipt = $this->assertSuccessfulTx($txHash, $stakingAddress, $fromAddress, $chainId);
        $raw = $this->getRawReceipt($txHash, $chainId);
        $logs = is_array($raw['logs'] ?? null) ? $raw['logs'] : [];

        $transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        $fromTopic = '0x'.str_pad(strtolower(substr($fromAddress, 2)), 64, '0', STR_PAD_LEFT);
        $toTopic = '0x'.str_pad(strtolower(substr($stakingAddress, 2)), 64, '0', STR_PAD_LEFT);
        $token = strtolower($tokenAddress);

        foreach ($logs as $log) {
            if (! is_array($log)) {
                continue;
            }
            $address = strtolower((string) ($log['address'] ?? ''));
            $topics = $log['topics'] ?? [];
            if ($address !== $token) {
                continue;
            }
            if (
                isset($topics[0], $topics[1], $topics[2])
                && strtolower((string) $topics[0]) === $transferTopic
                && strtolower((string) $topics[1]) === $fromTopic
                && strtolower((string) $topics[2]) === $toTopic
            ) {
                return $receipt;
            }
        }

        throw ValidationException::withMessages([
            'tx_hash' => 'Stake tx did not transfer PAB-D from wallet into the Staking contract. History not recorded.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function getRawReceipt(string $txHash, int $chainId = 56): array
    {
        $txHash = strtolower($txHash);
        $response = Http::timeout(20)->post($this->rpcUrl($chainId), [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => 'eth_getTransactionReceipt',
            'params' => [$txHash],
        ]);

        if (! $response->ok() || ! is_array($response->json('result'))) {
            throw ValidationException::withMessages(['tx_hash' => 'Unable to load transaction receipt.']);
        }

        return $response->json('result');
    }

    public function isValidAddress(?string $address): bool
    {
        return is_string($address) && (bool) preg_match('/^0x[a-fA-F0-9]{40}$/', $address);
    }
}
