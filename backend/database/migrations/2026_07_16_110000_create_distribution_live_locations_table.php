<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('distribution_live_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('ref_code', 50)->nullable();
            $table->string('ref_name')->nullable();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy', 8, 2)->nullable();
            $table->decimal('heading', 8, 2)->nullable();
            $table->decimal('speed', 8, 2)->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->timestamps();

            $table->unique('user_id');
            $table->index('captured_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distribution_live_locations');
    }
};
