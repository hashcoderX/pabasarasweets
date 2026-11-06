<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE distribution_payments MODIFY status ENUM('received','cleared','bounced','pending','returned','closed') NOT NULL DEFAULT 'received'");
    }

    public function down(): void
    {
        DB::statement("UPDATE distribution_payments SET status = 'cleared' WHERE status = 'closed'");
        DB::statement("ALTER TABLE distribution_payments MODIFY status ENUM('received','cleared','bounced','pending','returned') NOT NULL DEFAULT 'received'");
    }
};
