<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cheque_registry_entries', function (Blueprint $table) {
            $table->foreignId('company_bank_account_id')
                ->nullable()
                ->after('company_id')
                ->constrained('company_bank_accounts')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('cheque_registry_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_bank_account_id');
        });
    }
};
