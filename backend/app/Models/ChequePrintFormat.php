<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChequePrintFormat extends Model
{
    protected $fillable = [
        'name',
        'bank_name',
        'width_mm',
        'height_mm',
        'sample_image_path',
        'layout',
        'is_default',
        'created_by',
    ];

    protected $casts = [
        'width_mm' => 'float',
        'height_mm' => 'float',
        'layout' => 'array',
        'is_default' => 'boolean',
    ];

    protected $hidden = ['sample_image_path'];
}
