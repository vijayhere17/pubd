<?php

namespace Database\Seeders;

use App\Models\SaleSetting;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        SaleSetting::current();

        User::query()->updateOrCreate(
            ['wallet_address' => '0x1111111111111111111111111111111111111111'],
            [
                'name' => 'PAB-D Admin',
                'email' => 'admin@pabd.local',
                'password' => null,
                'is_admin' => true,
            ]
        );
    }
}
