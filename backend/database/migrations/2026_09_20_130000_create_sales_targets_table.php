<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_targets', function (Blueprint $table) {
            $table->id();
            $table->enum('target_type', ['employee', 'branch', 'product', 'territory']);
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->foreignId('route_id')->nullable()->constrained('routes')->nullOnDelete();
            $table->string('period_key', 30);
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('target_amount', 14, 2)->default(0);
            $table->decimal('target_quantity', 14, 2)->default(0);
            $table->decimal('achieved_amount', 14, 2)->default(0);
            $table->decimal('achieved_quantity', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['target_type', 'period_start', 'period_end']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_targets');
    }
};
