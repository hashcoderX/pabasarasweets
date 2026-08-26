<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Load extends Model
{
    protected $fillable = [
        'load_number',
        'vehicle_id',
        'driver_id',
        'sales_ref_id',
        'route_id',
        'status',
        'has_vehicle_balance',
        'load_date',
        'delivery_date',
        'total_weight',
        'notes'
    ];

    protected $casts = [
        'load_date' => 'date',
        'delivery_date' => 'date',
        'total_weight' => 'decimal:2',
        'has_vehicle_balance' => 'boolean',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'driver_id');
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function loadRoutes(): HasMany
    {
        return $this->hasMany(\App\Models\LoadRoute::class)->orderBy('sequence_no');
    }

    public function salesRef(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'sales_ref_id');
    }

    public function loadItems(): HasMany
    {
        return $this->hasMany(LoadItem::class);
    }

    public function loadExpenses(): HasMany
    {
        return $this->hasMany(LoadExpense::class);
    }
}
