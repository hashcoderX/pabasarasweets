<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('advance_payments', function (Blueprint $table) {
            $table->foreignId('main_cash_transaction_id')
                ->nullable()
                ->after('company_bank_account_id')
                ->constrained('main_cash_transactions')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('advance_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('main_cash_transaction_id');
        });
    }
};
