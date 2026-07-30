<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\TransactionController;
use Illuminate\Support\Facades\Route;

Route::get('/config', [DashboardController::class, 'publicConfig']);
Route::post('/auth/nonce', [AuthController::class, 'nonce']);
Route::post('/wallet-login', [AuthController::class, 'walletLogin']);
Route::post('/auth/login', [AuthController::class, 'walletLogin']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/dashboard', [DashboardController::class, 'show']);
    Route::get('/portfolio', [DashboardController::class, 'show']);

    Route::post('/transactions/buy', [TransactionController::class, 'buy']);
    Route::post('/transactions/stake', [TransactionController::class, 'stake']);
    Route::post('/transactions/claim', [TransactionController::class, 'claim']);
    Route::get('/transactions/history', [TransactionController::class, 'history']);

    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('/dashboard', [AdminController::class, 'dashboard']);
        Route::get('/settings', [AdminController::class, 'settings']);
        Route::put('/settings', [AdminController::class, 'updateSettings']);
        Route::post('/sale/pause', [AdminController::class, 'pauseSale']);
        Route::post('/sale/resume', [AdminController::class, 'resumeSale']);
        Route::get('/investors', [AdminController::class, 'investors']);
        Route::get('/stakers', [AdminController::class, 'stakers']);
        Route::get('/claims', [AdminController::class, 'claims']);
        Route::get('/logs', [AdminController::class, 'logs']);
        Route::get('/export', [AdminController::class, 'export']);
    });
});
