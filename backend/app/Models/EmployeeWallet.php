<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeWallet extends Model
{
    protected $fillable = [
        'employee_id',
        'wallet_number',
        'wallet_name',
        'balance',
        'currency',
        'status',
        'created_by',
    ];

    protected $casts = [
        'balance' => 'decimal:2',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
