<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('distribution_invoices')) {
            return;
        }

        Schema::table('distribution_invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('distribution_invoices', 'payment_type')) {
                $table->string('payment_type', 30)->nullable()->after('paid_amount');
            }
            if (!Schema::hasColumn('distribution_invoices', 'company_bank_account_id')) {
                $table->foreignId('company_bank_account_id')
                    ->nullable()
                    ->after('payment_type')
                    ->constrained('company_bank_accounts')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('distribution_invoices', 'cheque_number')) {
                $table->string('cheque_number', 100)->nullable()->after('company_bank_account_id');
            }
            if (!Schema::hasColumn('distribution_invoices', 'cheque_date')) {
                $table->date('cheque_date')->nullable()->after('cheque_number');
            }
            if (!Schema::hasColumn('distribution_invoices', 'cheque_bank_name')) {
                $table->string('cheque_bank_name', 255)->nullable()->after('cheque_date');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('distribution_invoices')) {
            return;
        }

        Schema::table('distribution_invoices', function (Blueprint $table) {
            if (Schema::hasColumn('distribution_invoices', 'company_bank_account_id')) {
                $table->dropConstrainedForeignId('company_bank_account_id');
            }
            foreach (['cheque_bank_name', 'cheque_date', 'cheque_number', 'payment_type'] as $column) {
                if (Schema::hasColumn('distribution_invoices', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
