<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PackagingBatch extends Model
{
    use HasFactory;

    protected $fillable = [
        'qc_inspection_id',
        'production_order_id',
        'batch_no',
        'final_product_name',
        'packaging_material_name',
        'packaging_material_quantity',
        'packaging_material_unit',
        'packed_quantity',
        'unit_price',
        'selling_price',
        'status',
        'label_code',
        'barcode_value',
        'qr_value',
        'packed_at',
        'expiry_date',
        'main_store_synced_at',
        'main_store_synced_quantity',
        'notes',
    ];

    protected $casts = [
        'packaging_material_quantity' => 'decimal:3',
        'packed_quantity' => 'decimal:3',
        'unit_price' => 'decimal:2',
        'selling_price' => 'decimal:2',
        'packed_at' => 'datetime',
        'expiry_date' => 'date',
        'main_store_synced_at' => 'datetime',
        'main_store_synced_quantity' => 'decimal:3',
    ];

    public function qcInspection(): BelongsTo
    {
        return $this->belongsTo(QcInspection::class, 'qc_inspection_id');
    }

    public function productionOrder(): BelongsTo
    {
        return $this->belongsTo(ProductionOrder::class, 'production_order_id');
    }

    public function materials(): HasMany
    {
        return $this->hasMany(PackagingBatchMaterial::class, 'packaging_batch_id');
    }
}
