<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GoodsReceivedNote extends Model
{
    protected $fillable = [
        'grn_number',
        'purchase_order_id',
        'received_date',
        'notes',
        'status',
        'total_amount',
        'discount_amount',
        'net_amount',
        'payment_status',
        'payment_timing',
        'payment_type',
        'payment_company_id',
        'payment_breakdown',
        'payment_reference',
        'paid_amount',
        'paid_at',
        'payment_note',
    ];

    protected $casts = [
        'received_date' => 'date',
        'paid_at' => 'datetime',
        'total_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'payment_breakdown' => 'array',
    ];

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function grnItems(): HasMany
    {
        return $this->hasMany(GrnItem::class, 'grn_id');
    }

    public function paymentCompany(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'payment_company_id');
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($grn) {
            if (empty($grn->grn_number)) {
                $grn->grn_number = static::generateGrnNumber();
            }
        });
    }

    public static function generateGrnNumber(): string
    {
        $year = date('Y');
        $lastGrn = static::where('grn_number', 'like', "GRN{$year}%")
                        ->orderBy('grn_number', 'desc')
                        ->first();

        if ($lastGrn) {
            $lastNumber = (int) substr($lastGrn->grn_number, -4);
            $newNumber = $lastNumber + 1;
        } else {
            $newNumber = 1;
        }

        return 'GRN' . $year . str_pad($newNumber, 4, '0', STR_PAD_LEFT);
    }
}
