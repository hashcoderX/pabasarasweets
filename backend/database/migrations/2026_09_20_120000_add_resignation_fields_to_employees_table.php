<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE employees MODIFY status ENUM('active', 'inactive', 'resigned') NOT NULL DEFAULT 'active'");
        }

        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'resigned_at')) {
                $table->date('resigned_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('employees', 'resignation_reason')) {
                $table->text('resignation_reason')->nullable()->after('resigned_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'resignation_reason')) {
                $table->dropColumn('resignation_reason');
            }
            if (Schema::hasColumn('employees', 'resigned_at')) {
                $table->dropColumn('resigned_at');
            }
        });

        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE employees MODIFY status ENUM('active', 'inactive') NOT NULL DEFAULT 'active'");
        }
    }
};
