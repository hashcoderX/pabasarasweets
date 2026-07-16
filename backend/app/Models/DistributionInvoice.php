<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DistributionInvoice extends Model
{
    protected $fillable = [
        'invoice_number',
        'customer_id',
        'load_id',
        'invoice_date',
        'due_date',
        'subtotal',
        'discount',
        'total',
        'paid_amount',
        'status',
        'notes',
        'ref_latitude',
        'ref_longitude',
        'ref_gps_accuracy',
        'ref_gps_captured_at',
        'billing_latitude',
        'billing_longitude',
        'billing_gps_accuracy',
        'billing_gps_captured_at',
        'created_by',
    ];

    protected $casts = [
        'invoice_date' => 'date',
        'due_date' => 'date',
        'subtotal' => 'decimal:2',
        'discount' => 'decimal:2',
        'total' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'ref_latitude' => 'float',
        'ref_longitude' => 'float',
        'ref_gps_accuracy' => 'float',
        'ref_gps_captured_at' => 'datetime',
        'billing_latitude' => 'float',
        'billing_longitude' => 'float',
        'billing_gps_accuracy' => 'float',
        'billing_gps_captured_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(DistributionCustomer::class, 'customer_id');
    }

    public function assignedLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class, 'load_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(DistributionInvoiceItem::class, 'distribution_invoice_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(DistributionPayment::class, 'distribution_invoice_id');
    }
}
