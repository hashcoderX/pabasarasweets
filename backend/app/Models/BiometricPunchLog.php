<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BiometricPunchLog extends Model
{
    protected $fillable = [
        'device_user_id',
        'employee_id',
        'punch_time',
        'direction',
        'verify_mode',
        'device_mac',
        'source_ip',
        'source',
        'raw_hex',
        'result',
        'message',
    ];

    protected $casts = [
        'punch_time' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
