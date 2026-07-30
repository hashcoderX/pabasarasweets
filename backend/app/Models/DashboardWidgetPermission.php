<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DashboardWidgetPermission extends Model
{
    protected $fillable = [
        'user_id',
        'widget_key',
        'is_visible',
        'hidden_at',
    ];

    protected $casts = [
        'is_visible' => 'boolean',
        'hidden_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
