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
        Schema::create('load_routes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('load_id')->constrained('loads')->cascadeOnDelete();
            $table->foreignId('route_id')->constrained('routes')->restrictOnDelete();
            $table->unsignedInteger('sequence_no')->default(1);
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->unique(['load_id', 'route_id']);
            $table->index(['load_id', 'sequence_no']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('load_routes');
    }
};
