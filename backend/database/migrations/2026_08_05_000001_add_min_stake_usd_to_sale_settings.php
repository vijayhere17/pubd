<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_settings', function (Blueprint $table) {
            $table->decimal('min_stake_usd', 18, 8)->default(500)->after('stake_apy_default');
        });
    }

    public function down(): void
    {
        Schema::table('sale_settings', function (Blueprint $table) {
            $table->dropColumn('min_stake_usd');
        });
    }
};
