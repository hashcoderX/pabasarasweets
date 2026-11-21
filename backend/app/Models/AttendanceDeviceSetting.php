<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceDeviceSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'device_name',
        'communication_type',
        'communication_password',
        'dhcp_enabled',
        'device_ip',
        'device_port',
        'subnet_mask',
        'gateway',
        'dns',
        'real_time_push_enabled',
        'server_host',
        'server_port',
        'p2p_service_enabled',
        'is_active',
        'last_tested_at',
        'last_test_result',
        'last_synced_at',
        'last_sync_summary',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'dhcp_enabled' => 'boolean',
        'real_time_push_enabled' => 'boolean',
        'p2p_service_enabled' => 'boolean',
        'is_active' => 'boolean',
        'last_tested_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'last_sync_summary' => 'array',
    ];
}

