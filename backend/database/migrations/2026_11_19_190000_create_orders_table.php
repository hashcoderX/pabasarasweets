<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders')) {
            return;
        }

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 60)->unique();
            $table->string('order_type', 30)->default('outlet_order');
            $table->string('status', 30)->default('pending');
            $table->foreignId('outlet_id')->nullable()->constrained('outlets')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('order_date');
            $table->string('customer_name')->nullable();
            $table->decimal('total_quantity', 12, 2)->default(0);
            $table->decimal('total_amount', 14, 2)->default(0);
            $table->decimal('discount_amount', 14, 2)->default(0);
            $table->decimal('paid_amount', 14, 2)->default(0);
            $table->string('payment_type', 20)->default('cash');
            $table->decimal('balance_amount', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['order_type', 'order_date']);
            $table->index(['outlet_id', 'order_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
