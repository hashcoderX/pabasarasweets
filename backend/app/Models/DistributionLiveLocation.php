<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DistributionLiveLocation extends Model
{
    protected $fillable = [
        'user_id',
        'employee_id',
        'ref_code',
        'ref_name',
        'latitude',
        'longitude',
        'accuracy',
        'heading',
        'speed',
        'captured_at',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'accuracy' => 'float',
        'heading' => 'float',
        'speed' => 'float',
        'captured_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
