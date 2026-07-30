<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackagingBatchMaterial extends Model
{
    use HasFactory;

    protected $fillable = [
        'packaging_batch_id',
        'raw_material_id',
        'inventory_item_id',
        'material_name',
        'material_code',
        'material_unit',
        'quantity_per_pack',
        'consumed_quantity',
    ];

    protected $casts = [
        'quantity_per_pack' => 'decimal:4',
        'consumed_quantity' => 'decimal:4',
    ];

    public function packagingBatch(): BelongsTo
    {
        return $this->belongsTo(PackagingBatch::class, 'packaging_batch_id');
    }

    public function rawMaterial(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class, 'raw_material_id');
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }
}
