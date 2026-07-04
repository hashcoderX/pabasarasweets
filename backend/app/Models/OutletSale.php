<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OutletSale extends Model
{
    protected $fillable = [
        'sale_number',
        'do_number',
        'status',
        'outlet_id',
        'sold_by',
        'sale_date',
        'customer_name',
        'loyalty_customer_id',
        'load_id',
        'delivery_employee_id',
        'delivery_employee_name',
        'total_quantity',
        'total_amount',
        'discount_amount',
        'paid_amount',
        'payment_type',
        'balance_amount',
        'loyalty_points_awarded',
        'notes',
    ];

    protected $casts = [
        'sale_date' => 'datetime',
        'total_quantity' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'balance_amount' => 'decimal:2',
        'loyalty_points_awarded' => 'decimal:2',
    ];

    public function outlet(): BelongsTo
    {
        return $this->belongsTo(Outlet::class);
    }

    public function soldByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sold_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OutletSaleItem::class);
    }

    public function loyaltyCustomer(): BelongsTo
    {
        return $this->belongsTo(OutletLoyaltyCustomer::class, 'loyalty_customer_id');
    }

    public function assignedLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class, 'load_id');
    }
}
