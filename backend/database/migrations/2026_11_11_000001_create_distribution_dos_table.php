<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('distribution_dos', function (Blueprint $table) {
            $table->id();
            $table->string('do_number', 60)->unique();
            $table->foreignId('customer_id')->constrained('distribution_customers')->cascadeOnDelete();
            $table->foreignId('load_id')->nullable()->constrained('loads')->nullOnDelete();
            $table->date('do_date');
            $table->date('due_date')->nullable();
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->decimal('paid_amount', 12, 2)->default(0);
            $table->enum('status', ['pending', 'partial', 'paid', 'cancelled'])->default('pending');
            $table->text('notes')->nullable();
            $table->decimal('ref_latitude', 10, 7)->nullable();
            $table->decimal('ref_longitude', 10, 7)->nullable();
            $table->decimal('ref_gps_accuracy', 10, 2)->nullable();
            $table->timestamp('ref_gps_captured_at')->nullable();
            $table->decimal('billing_latitude', 10, 7)->nullable();
            $table->decimal('billing_longitude', 10, 7)->nullable();
            $table->decimal('billing_gps_accuracy', 10, 2)->nullable();
            $table->timestamp('billing_gps_captured_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distribution_dos');
    }
};
