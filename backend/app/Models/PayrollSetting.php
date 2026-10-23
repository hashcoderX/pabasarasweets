<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollSetting extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'salary_mode',
        'daily_rate',
        'standard_working_days',
        'prorate_by_attendance',
        'sunday_payment_enabled',
        'sunday_payment_rate',
        'poya_payment_enabled',
        'poya_payment_rate',
    ];

    protected $casts = [
        'daily_rate' => 'decimal:2',
        'prorate_by_attendance' => 'boolean',
        'sunday_payment_enabled' => 'boolean',
        'sunday_payment_rate' => 'decimal:2',
        'poya_payment_enabled' => 'boolean',
        'poya_payment_rate' => 'decimal:2',
        'standard_working_days' => 'integer',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'tenant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'branch_id');
    }
}
