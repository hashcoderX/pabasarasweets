<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdvancePayment extends Model
{
    protected $fillable = [
        'date',
        'advance_type',
        'accounting_classification',
        'entry_type',
        'amount',
        'beneficiary_name',
        'payment_method',
        'company_id',
        'company_bank_account_id',
        'main_cash_transaction_id',
        'reference',
        'note',
        'created_by',
    ];

    protected $casts = [
        'date' => 'date',
        'amount' => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function companyBankAccount(): BelongsTo
    {
        return $this->belongsTo(CompanyBankAccount::class, 'company_bank_account_id');
    }

    public function mainCashTransaction(): BelongsTo
    {
        return $this->belongsTo(MainCashTransaction::class, 'main_cash_transaction_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

