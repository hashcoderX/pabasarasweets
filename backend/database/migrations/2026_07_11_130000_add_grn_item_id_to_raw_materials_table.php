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
        Schema::table('raw_materials', function (Blueprint $table) {
            $table->dropForeign(['inventory_item_id']);
            $table->dropUnique('raw_materials_inventory_item_id_unique');
            $table->foreignId('grn_item_id')->nullable()->after('inventory_item_id')->constrained('grn_items')->nullOnDelete();
            $table->foreign('inventory_item_id')->references('id')->on('inventory_items')->cascadeOnDelete();
            $table->index(['inventory_item_id', 'grn_item_id'], 'raw_materials_inventory_batch_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('raw_materials', function (Blueprint $table) {
            $table->dropIndex('raw_materials_inventory_batch_idx');
            $table->dropConstrainedForeignId('grn_item_id');
            $table->dropForeign(['inventory_item_id']);
            $table->unique('inventory_item_id');
            $table->foreign('inventory_item_id')->references('id')->on('inventory_items')->cascadeOnDelete();
        });
    }
};
