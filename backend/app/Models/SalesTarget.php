<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesTarget extends Model
{
    protected $fillable = [
        'target_type', 'employee_id', 'branch_id', 'inventory_item_id', 'route_id',
        'period_key', 'period_start', 'period_end', 'target_amount', 'target_quantity',
        'achieved_amount', 'achieved_quantity', 'notes', 'is_active',
        'all_products',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'target_amount' => 'decimal:2',
        'target_quantity' => 'decimal:2',
        'achieved_amount' => 'decimal:2',
        'achieved_quantity' => 'decimal:2',
        'is_active' => 'boolean',
        'all_products' => 'boolean',
    ];

    public function employee(): BelongsTo { return $this->belongsTo(Employee::class); }
    public function branch(): BelongsTo { return $this->belongsTo(Company::class, 'branch_id'); }
    public function product(): BelongsTo { return $this->belongsTo(InventoryItem::class, 'inventory_item_id'); }
    public function territory(): BelongsTo { return $this->belongsTo(Route::class, 'route_id'); }
    public function products(): HasMany { return $this->hasMany(SalesTargetProduct::class); }
    public function territories(): HasMany { return $this->hasMany(SalesTargetTerritory::class); }
}
