<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('cheque_print_formats')) {
            return;
        }

        Schema::create('cheque_print_formats', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('bank_name')->nullable();
            $table->decimal('width_mm', 6, 2)->default(178);
            $table->decimal('height_mm', 6, 2)->default(89);
            $table->string('sample_image_path')->nullable();
            $table->json('layout')->nullable();
            $table->boolean('is_default')->default(false);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cheque_print_formats');
    }
};
