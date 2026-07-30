<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('packaging_batch_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('packaging_batch_id')->constrained('packaging_batches')->cascadeOnDelete();
            $table->foreignId('raw_material_id')->constrained('raw_materials')->restrictOnDelete();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->restrictOnDelete();
            $table->string('material_name', 180);
            $table->string('material_code', 120)->nullable();
            $table->string('material_unit', 30)->nullable();
            $table->decimal('quantity_per_pack', 15, 4)->default(0);
            $table->decimal('consumed_quantity', 15, 4)->default(0);
            $table->timestamps();

            $table->index(['packaging_batch_id', 'raw_material_id'], 'pbm_batch_raw_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packaging_batch_materials');
    }
};
