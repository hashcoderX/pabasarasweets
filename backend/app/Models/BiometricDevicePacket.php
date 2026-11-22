<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BiometricDevicePacket extends Model
{
    protected $fillable = [
        'source_ip',
        'protocol',
        'bytes',
        'payload_hex',
        'payload_text',
        'status',
        'events_count',
        'message',
    ];
}
