<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outlet_cash_drawer_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->foreignId('session_id')->nullable()->constrained('outlet_cash_drawer_sessions')->nullOnDelete();
            $table->date('session_date');
            $table->decimal('amount', 14, 2);
            $table->string('status', 20)->default('pending');
            $table->dateTime('requested_at');
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['outlet_id', 'status']);
            $table->index(['session_date', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outlet_cash_drawer_transfers');
    }
};

