<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesTargetTerritory extends Model
{
    public $timestamps = false;
    protected $fillable = ['sales_target_id', 'route_id'];
    public function target(): BelongsTo { return $this->belongsTo(SalesTarget::class, 'sales_target_id'); }
    public function territory(): BelongsTo { return $this->belongsTo(Route::class, 'route_id'); }
}
