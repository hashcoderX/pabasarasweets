<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoadExpense extends Model
{
    protected $fillable = [
        'load_id',
        'expense_date',
        'expense_type',
        'amount',
        'reference',
        'note',
        'bill_attachment_path',
        'bill_attachment_name',
        'delivery_cash_transaction_id',
        'created_by',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'amount' => 'decimal:2',
    ];

    public function parentLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class);
    }

    public function deliveryCashTransaction(): BelongsTo
    {
        return $this->belongsTo(DeliveryCashTransaction::class, 'delivery_cash_transaction_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
