<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyBankAccount extends Model
{
    protected $fillable = [
        'company_id',
        'bank_name',
        'branch',
        'account_no',
        'current_balance',
    ];

    protected $casts = [
        'current_balance' => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
