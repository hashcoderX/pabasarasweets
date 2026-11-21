<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_completion_cash_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('load_id')->nullable()->constrained('loads')->nullOnDelete();
            $table->string('load_number', 80);
            $table->date('delivery_date');
            $table->decimal('amount', 14, 2);
            $table->string('status', 20)->default('pending');
            $table->dateTime('requested_at');
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['status', 'delivery_date']);
            $table->index(['load_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_completion_cash_transfers');
    }
};

