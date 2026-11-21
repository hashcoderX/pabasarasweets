<?php

namespace App\Models;

use App\Models\DistributionDo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DistributionDoItem extends Model
{
    protected $fillable = [
        'distribution_do_id',
        'load_id',
        'inventory_item_id',
        'item_code',
        'item_name',
        'unit',
        'quantity',
        'unit_price',
        'discount',
        'line_total',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'discount' => 'decimal:2',
        'line_total' => 'decimal:2',
    ];

    public function dispatchOrder(): BelongsTo
    {
        return $this->belongsTo(DistributionDo::class, 'distribution_do_id');
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function assignedLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class, 'load_id');
    }
}
