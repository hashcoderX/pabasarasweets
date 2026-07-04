<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    protected $fillable = [
        'name',
        'email',
        'address',
        'phone',
        'telephone',
        'whatsapp_number',
        'website',
        'country',
        'currency',
        'logo_path',
        'current_cash_balance',
        'current_bank_balance',
        'bank_name',
        'bank_account_no',
        'current_cheque_balance',
    ];

    protected $casts = [
        'current_cash_balance' => 'decimal:2',
        'current_bank_balance' => 'decimal:2',
        'current_cheque_balance' => 'decimal:2',
    ];

    protected $appends = [
        'logo_url',
    ];

    public function getLogoUrlAttribute(): ?string
    {
        if (!$this->logo_path) {
            return null;
        }

        return asset('storage/' . ltrim($this->logo_path, '/'));
    }

    public function bankAccounts(): HasMany
    {
        return $this->hasMany(CompanyBankAccount::class);
    }

    public function chequeAccounts(): HasMany
    {
        return $this->hasMany(CompanyChequeAccount::class);
    }
}
