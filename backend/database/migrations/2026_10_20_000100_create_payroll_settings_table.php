<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('payroll_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->enum('salary_mode', ['monthly', 'daily'])->default('monthly');
            $table->decimal('daily_rate', 10, 2)->nullable();
            $table->unsignedInteger('standard_working_days')->default(30);
            $table->boolean('prorate_by_attendance')->default(true);
            $table->boolean('sunday_payment_enabled')->default(false);
            $table->decimal('sunday_payment_rate', 10, 2)->nullable();
            $table->boolean('poya_payment_enabled')->default(false);
            $table->decimal('poya_payment_rate', 10, 2)->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('companies');
            $table->foreign('branch_id')->references('id')->on('companies');
            $table->unique(['tenant_id', 'branch_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payroll_settings');
    }
};
