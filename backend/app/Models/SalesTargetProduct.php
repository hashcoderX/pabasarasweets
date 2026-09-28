<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesTargetProduct extends Model
{
    public $timestamps = false;
    protected $fillable = ['sales_target_id', 'inventory_item_id'];
    public function target(): BelongsTo { return $this->belongsTo(SalesTarget::class, 'sales_target_id'); }
    public function product(): BelongsTo { return $this->belongsTo(InventoryItem::class, 'inventory_item_id'); }
}
