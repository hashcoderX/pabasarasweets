<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\GrnItem;

class RawMaterial extends Model
{
    use HasFactory;

    protected $fillable = [
        'inventory_item_id',
        'grn_item_id',
        'status',
    ];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function bomItems(): HasMany
    {
        return $this->hasMany(BomItem::class, 'material_id');
    }

    public function grnItem(): BelongsTo
    {
        return $this->belongsTo(GrnItem::class, 'grn_item_id');
    }
}
