<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('advance_payments', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->enum('advance_type', [
                'supplier_advance',
                'employee_advance',
                'travel_advance',
                'contractor_advance',
                'rent_advance',
                'insurance_advance',
                'utility_deposit',
                'customer_advance',
            ]);
            $table->enum('accounting_classification', [
                'current_asset',
                'prepaid_asset',
                'deposit_asset',
                'liability',
            ]);
            $table->enum('entry_type', ['in', 'out']);
            $table->decimal('amount', 15, 2);
            $table->string('beneficiary_name', 255);
            $table->enum('payment_method', ['cash', 'bank_transfer', 'cheque', 'card', 'other']);
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->foreignId('company_bank_account_id')->nullable()->constrained('company_bank_accounts')->nullOnDelete();
            $table->string('reference', 120)->nullable();
            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['advance_type', 'date']);
            $table->index(['entry_type', 'date']);
            $table->index('accounting_classification');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('advance_payments');
    }
};

