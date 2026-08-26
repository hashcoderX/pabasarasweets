<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoadItem extends Model
{
    protected $fillable = [
        'load_id',
        'product_code',
        'name',
        'type',
        'out_price',
        'sell_price',
        'qty',
        'loaded_qty'
    ];

    protected $casts = [
        'out_price' => 'decimal:2',
        'sell_price' => 'decimal:2',
        'qty' => 'decimal:2',
        'loaded_qty' => 'decimal:2',
    ];

    public function loadRecord(): BelongsTo
    {
        return $this->belongsTo(Load::class);
    }
}
