<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoadRoute extends Model
{
    protected $fillable = [
        'load_id',
        'route_id',
        'sequence_no',
        'is_primary',
    ];

    protected $casts = [
        'sequence_no' => 'integer',
        'is_primary' => 'boolean',
    ];

    public function parentLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }
}
