<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('employee_wallets')) {
            return;
        }

        Schema::create('employee_wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('wallet_number', 80)->unique();
            $table->string('wallet_name', 120)->nullable();
            $table->decimal('balance', 14, 2)->default(0);
            $table->string('currency', 10)->default('LKR');
            $table->string('status', 20)->default('active');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('employee_id');
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_wallets');
    }
};
