<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('order_items')) {
            return;
        }

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->string('item_code', 100)->nullable();
            $table->string('item_name');
            $table->string('unit', 50)->nullable();
            $table->string('issue_type', 30)->default('retail');
            $table->decimal('discount_amount', 14, 2)->default(0);
            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
