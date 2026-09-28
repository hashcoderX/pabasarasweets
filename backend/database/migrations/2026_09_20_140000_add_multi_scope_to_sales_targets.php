<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_targets', function (Blueprint $table) {
            $table->boolean('all_products')->default(false)->after('inventory_item_id');
        });

        Schema::create('sales_target_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_target_id')->constrained('sales_targets')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->unique(['sales_target_id', 'inventory_item_id']);
        });

        Schema::create('sales_target_territories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_target_id')->constrained('sales_targets')->cascadeOnDelete();
            $table->foreignId('route_id')->constrained('routes')->cascadeOnDelete();
            $table->unique(['sales_target_id', 'route_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_target_territories');
        Schema::dropIfExists('sales_target_products');
        Schema::table('sales_targets', function (Blueprint $table) {
            $table->dropColumn('all_products');
        });
    }
};
