<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChequeRegistryEntry extends Model
{
    protected $fillable = [
        'company_id',
        'company_bank_account_id',
        'company_cheque_account_id',
        'distribution_payment_id',
        'direction',
        'lifecycle_status',
        'source_module',
        'cheque_no',
        'cheque_date',
        'deposit_date',
        'amount',
        'bank_name',
        'account_no',
        'counterparty_name',
        'reference_no',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'cheque_date' => 'date',
        'deposit_date' => 'date',
        'amount' => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function chequeAccount(): BelongsTo
    {
        return $this->belongsTo(CompanyChequeAccount::class, 'company_cheque_account_id');
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(CompanyBankAccount::class, 'company_bank_account_id');
    }

    public function distributionPayment(): BelongsTo
    {
        return $this->belongsTo(DistributionPayment::class, 'distribution_payment_id');
    }
}
