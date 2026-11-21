<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->enum('payment_request_type', [
                'monthly_payroll',
                'weekly_payroll',
                'daily_payroll',
                'daily_wage_request',
                'salary_advance_request',
            ])->default('monthly_payroll')->after('employee_type');
        });

        DB::statement("
            ALTER TABLE employees
            MODIFY COLUMN employee_type ENUM('full_time', 'part_time', 'contract', 'temporary', 'daily_wage')
            NOT NULL DEFAULT 'full_time'
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("
            UPDATE employees
            SET employee_type = 'contract'
            WHERE employee_type IN ('temporary', 'daily_wage')
        ");

        DB::statement("
            ALTER TABLE employees
            MODIFY COLUMN employee_type ENUM('full_time', 'part_time', 'contract')
            NOT NULL DEFAULT 'full_time'
        ");

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('payment_request_type');
        });
    }
};

