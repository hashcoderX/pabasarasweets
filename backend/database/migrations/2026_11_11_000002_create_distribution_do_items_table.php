<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('distribution_do_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('distribution_do_id')->constrained('distribution_dos')->cascadeOnDelete();
            $table->foreignId('load_id')->nullable()->constrained('loads')->nullOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->string('item_code', 80);
            $table->string('item_name');
            $table->string('unit', 30)->nullable();
            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distribution_do_items');
    }
};
