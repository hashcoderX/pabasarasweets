<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionPayment;
use App\Models\InventoryItem;
use App\Models\Load;
use App\Models\LoadRoute;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class LoadController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Load::with(['vehicle', 'driver', 'salesRef', 'route', 'loadRoutes.route']);

        if ($user) {
            $isAdmin = (!$user->employee_id) || $user->hasRole('Super Admin');

            if (!$isAdmin && $user->employee_id) {
                $query->where('sales_ref_id', $user->employee_id);
            }
        }

        $loads = $query->orderByDesc('id')->get();

        return response()->json($loads);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'load_number' => 'required|string|unique:loads',
            'vehicle_id' => 'required|exists:vehicles,id',
            'driver_id' => 'required|exists:employees,id',
            'sales_ref_id' => 'nullable|exists:employees,id',
            'route_id' => 'required|exists:routes,id',
            'status' => 'in:pending,in_transit,delivered,cancelled',
            'load_date' => 'required|date|after_or_equal:today',
            'delivery_date' => 'nullable|date|after_or_equal:load_date',
            'total_weight' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $payload = $validator->validated();
        if (!array_key_exists('total_weight', $payload)) {
            $payload['total_weight'] = 0;
        }

        $load = DB::transaction(function () use ($payload) {
            $load = Load::create($payload);

            LoadRoute::create([
                'load_id' => $load->id,
                'route_id' => (int) $load->route_id,
                'sequence_no' => 1,
                'is_primary' => true,
            ]);

            return $load;
        });

        return response()->json([
            'message' => 'Load created successfully',
            'load' => $load->load(['vehicle', 'driver', 'salesRef', 'route', 'loadRoutes.route'])
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Load $load): JsonResponse
    {
        return response()->json($load->load(['vehicle', 'driver', 'salesRef', 'route', 'loadRoutes.route']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Load $load): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'load_number' => 'required|string|unique:loads,load_number,' . $load->id,
            'vehicle_id' => 'required|exists:vehicles,id',
            'driver_id' => 'required|exists:employees,id',
            'sales_ref_id' => 'nullable|exists:employees,id',
            'route_id' => 'required|exists:routes,id',
            'status' => 'in:pending,in_transit,delivered,cancelled',
            'load_date' => 'required|date',
            'delivery_date' => 'nullable|date|after_or_equal:load_date',
            'total_weight' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $payload = $validator->validated();

        DB::transaction(function () use ($load, $payload) {
            $load->update($payload);

            $primary = LoadRoute::where('load_id', $load->id)
                ->where('is_primary', true)
                ->first();

            if ($primary) {
                $primary->update([
                    'route_id' => (int) $load->route_id,
                    'sequence_no' => 1,
                ]);
            } else {
                LoadRoute::firstOrCreate(
                    [
                        'load_id' => $load->id,
                        'route_id' => (int) $load->route_id,
                    ],
                    [
                        'sequence_no' => 1,
                        'is_primary' => true,
                    ]
                );
            }
        });

        return response()->json([
            'message' => 'Load updated successfully',
            'load' => $load->load(['vehicle', 'driver', 'salesRef', 'route', 'loadRoutes.route'])
        ]);
    }

    public function addRoute(Request $request, Load $load): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'route_id' => 'required|exists:routes,id',
            'sequence_no' => 'nullable|integer|min:2',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $routeId = (int) $request->input('route_id');

        if (LoadRoute::where('load_id', $load->id)->where('route_id', $routeId)->exists()) {
            return response()->json([
                'message' => 'This route is already assigned to the load.',
            ], 422);
        }

        $maxSequence = (int) LoadRoute::where('load_id', $load->id)->max('sequence_no');
        $nextSequence = $maxSequence > 0 ? $maxSequence + 1 : 2;
        $sequenceNo = (int) ($request->input('sequence_no') ?: $nextSequence);

        $entry = LoadRoute::create([
            'load_id' => $load->id,
            'route_id' => $routeId,
            'sequence_no' => $sequenceNo,
            'is_primary' => false,
        ]);

        return response()->json([
            'message' => 'Additional route added successfully',
            'route' => $entry->load('route'),
            'load' => $load->fresh()->load(['vehicle', 'driver', 'salesRef', 'route', 'loadRoutes.route']),
        ], 201);
    }

    public function removeRoute(Load $load, LoadRoute $loadRoute): JsonResponse
    {
        if ((int) $loadRoute->load_id !== (int) $load->id) {
            return response()->json([
                'message' => 'Invalid route assignment for this load.',
            ], 422);
        }

        if ((bool) $loadRoute->is_primary === true || (int) $loadRoute->sequence_no === 1) {
            return response()->json([
                'message' => 'Primary route cannot be removed from load.',
            ], 422);
        }

        DB::transaction(function () use ($load, $loadRoute) {
            $loadRoute->delete();

            $entries = LoadRoute::where('load_id', $load->id)
                ->orderBy('sequence_no')
                ->orderBy('id')
                ->get();

            $nextSequence = 1;
            foreach ($entries as $entry) {
                $isPrimary = (bool) $entry->is_primary;
                if ($isPrimary) {
                    $entry->update(['sequence_no' => 1]);
                    $nextSequence = 2;
                    continue;
                }

                $entry->update(['sequence_no' => $nextSequence]);
                $nextSequence++;
            }
        });

        return response()->json([
            'message' => 'Additional route removed successfully',
            'load' => $load->fresh()->load(['vehicle', 'driver', 'salesRef', 'route', 'loadRoutes.route']),
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Load $load): JsonResponse
    {
        $load->delete();

        return response()->json([
            'message' => 'Load deleted successfully'
        ]);
    }

    public function deliverySummary(Request $request, Load $load): JsonResponse
    {
        $fromDate = $load->load_date;
        $toDate = $load->delivery_date ?? now();

        $routeIds = $load->loadRoutes()->pluck('route_id')->values()->all();
        if (empty($routeIds)) {
            $routeIds = [$load->route_id];
        }

        $invoices = DistributionInvoice::with(['customer:id,shop_name,customer_code,route_id', 'items'])
            ->whereBetween('invoice_date', [$fromDate, $toDate])
            ->whereHas('customer', function ($q) use ($routeIds) {
                $q->whereIn('route_id', $routeIds);
            })
            ->get(['id', 'invoice_number', 'customer_id', 'invoice_date', 'total', 'status', 'paid_amount']);

        $invoiceTotal = (float) $invoices->sum('total');
        $invoiceCount = $invoices->count();

        $customerIds = $invoices->pluck('customer_id')->filter()->unique()->values();

        $payments = $customerIds->isEmpty()
            ? collect([])
            : DistributionPayment::whereIn('customer_id', $customerIds)
                ->whereBetween('payment_date', [$fromDate, $toDate])
                ->where('status', '!=', 'bounced')
                ->get(['id', 'payment_number', 'payment_date', 'amount', 'payment_method', 'reference_no', 'bank_name', 'status']);

        $totalCollected = (float) $payments->sum('amount');

        $byMethod = $payments->groupBy('payment_method')->map(function ($group) {
            return [
                'total' => (float) $group->sum('amount'),
                'count' => $group->count(),
            ];
        });

        $cheques = $payments->where('payment_method', 'check')->values();

        // Aggregate item-level sales from invoices (quantity and value) keyed by item_code
        $itemSales = [];
        foreach ($invoices as $invoice) {
            foreach ($invoice->items as $item) {
                $code = $item->item_code;
                if (!isset($itemSales[$code])) {
                    $itemSales[$code] = [
                        'item_code' => $code,
                        'item_name' => $item->item_name,
                        'unit' => $item->unit,
                        'sold_qty' => 0.0,
                        'sold_value' => 0.0,
                        'return_qty' => 0.0,
                        'return_value' => 0.0,
                        'net_qty' => 0.0,
                        'net_value' => 0.0,
                        'cost_value' => 0.0,
                        'profit' => 0.0,
                    ];
                }

                $itemSales[$code]['sold_qty'] += (float) $item->quantity;
                $lineValue = (float) $item->quantity * (float) $item->unit_price;
                $itemSales[$code]['sold_value'] += $lineValue;
            }
        }

        // Fetch returns within the same period for customers on this route
        $returns = $customerIds->isEmpty()
            ? collect([])
            : \App\Models\DistributionReturn::whereIn('customer_id', $customerIds)
                ->whereBetween('return_date', [$fromDate, $toDate])
                ->with('returnedItem:id,code')
                ->get(['id', 'customer_id', 'returned_inventory_item_id', 'return_date', 'total_quantity', 'total_amount']);

        foreach ($returns as $return) {
            $code = $return->returnedItem?->code;
            if (!$code) {
                continue;
            }

            if (!isset($itemSales[$code])) {
                $itemSales[$code] = [
                    'item_code' => $code,
                    'item_name' => $return->returnedItem->name ?? $code,
                    'unit' => $return->returnedItem->unit ?? null,
                    'sold_qty' => 0.0,
                    'sold_value' => 0.0,
                    'return_qty' => 0.0,
                    'return_value' => 0.0,
                    'net_qty' => 0.0,
                    'net_value' => 0.0,
                    'cost_value' => 0.0,
                    'profit' => 0.0,
                ];
            }

            $itemSales[$code]['return_qty'] += (float) $return->total_quantity;
            $itemSales[$code]['return_value'] += (float) $return->total_amount;
        }

        // Map to collection for further calculations
        $itemSalesCollection = collect($itemSales);

        // Attach cost from load items (out_price) and compute profit per item
        $loadItems = $load->loadItems()->get(['product_code', 'out_price', 'sell_price']);
        foreach ($itemSalesCollection as $code => &$row) {
            $loadItem = $loadItems->firstWhere('product_code', $code);
            $netQty = (float) $row['sold_qty'] - (float) $row['return_qty'];
            $netValue = (float) $row['sold_value'] - (float) $row['return_value'];
            $costPerUnit = $loadItem ? (float) $loadItem->out_price : 0.0;
            $costValue = $costPerUnit * $netQty;
            $profit = $netValue - $costValue;

            $row['net_qty'] = $netQty;
            $row['net_value'] = $netValue;
            $row['cost_value'] = $costValue;
            $row['profit'] = $profit;
        }
        unset($row);

        $totalCost = (float) $itemSalesCollection->sum('cost_value');
        $totalProfit = (float) $itemSalesCollection->sum('profit');

        return response()->json([
            'success' => true,
            'data' => [
                'load' => [
                    'id' => $load->id,
                    'load_number' => $load->load_number,
                    'route_id' => $load->route_id,
                    'sales_ref_id' => $load->sales_ref_id,
                    'status' => $load->status,
                    'load_date' => $fromDate,
                    'delivery_date' => $load->delivery_date,
                ],
                'period' => [
                    'from' => $fromDate,
                    'to' => $toDate,
                ],
                'invoices' => [
                    'count' => $invoiceCount,
                    'total_amount' => $invoiceTotal,
                    'total_cost' => $totalCost,
                    'total_profit' => $totalProfit,
                ],
                'payments' => [
                    'total_collected' => $totalCollected,
                    'by_method' => $byMethod,
                    'cheques' => $cheques,
                ],
                'items' => $itemSalesCollection->values(),
            ],
        ]);
    }

    public function complete(Request $request, Load $load): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'add_balance_to_main_stock' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $addBalanceToMainStock = (bool) $request->boolean('add_balance_to_main_stock');

        if (in_array($load->status, ['delivered', 'cancelled'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'This load is already completed or cancelled.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($load, $addBalanceToMainStock) {
                $lockedLoad = Load::where('id', $load->id)->lockForUpdate()->firstOrFail();
                $items = $lockedLoad->loadItems()->lockForUpdate()->get();

                $remainingQty = round((float) $items->sum('qty'), 2);

                if ($addBalanceToMainStock && $remainingQty > 0) {
                    foreach ($items as $item) {
                        $qty = round((float) ($item->qty ?? 0), 2);
                        if ($qty <= 0) {
                            continue;
                        }

                        // Prefer exact variant by product code + load batch no, fallback to product code.
                        $inventory = InventoryItem::where('code', $item->product_code)
                            ->where(function ($q) use ($lockedLoad) {
                                $q->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.batch_no')) = ?", [$lockedLoad->load_number])
                                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.last_batch_no')) = ?", [$lockedLoad->load_number])
                                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.vehicle_load_batch_no')) = ?", [$lockedLoad->load_number]);
                            })
                            ->lockForUpdate()
                            ->first();

                        if (!$inventory) {
                            $inventory = InventoryItem::where('code', $item->product_code)
                                ->lockForUpdate()
                                ->first();
                        }

                        if (!$inventory) {
                            $inventory = InventoryItem::create([
                                'name' => $item->name,
                                'code' => $item->product_code,
                                'description' => 'Auto-created from load completion stock return.',
                                'type' => 'finished_good',
                                'category' => 'Main Store',
                                'unit' => 'pcs',
                                'current_stock' => 0,
                                'minimum_stock' => 0,
                                'maximum_stock' => null,
                                'unit_price' => (float) ($item->out_price ?? 0),
                                'purchase_price' => (float) ($item->out_price ?? 0),
                                'sell_price' => (float) ($item->sell_price ?? 0),
                                'location' => 'Main Store',
                                'status' => 'active',
                                'additional_info' => [
                                    'batch_no' => $lockedLoad->load_number,
                                    'vehicle_load_batch_no' => $lockedLoad->load_number,
                                    'source' => 'load_complete_return',
                                ],
                            ]);
                        }

                        $info = $inventory->additional_info ?? [];
                        $info['batch_no'] = $info['batch_no'] ?? $lockedLoad->load_number;
                        $info['vehicle_load_batch_no'] = $lockedLoad->load_number;
                        $info['last_returned_load_id'] = $lockedLoad->id;
                        $info['last_returned_at'] = now()->toDateTimeString();
                        $inventory->additional_info = $info;

                        $inventory->current_stock = round((float) ($inventory->current_stock ?? 0) + $qty, 2);
                        $inventory->save();

                        $item->qty = 0;
                        $item->save();
                    }

                    $remainingQty = 0;
                }

                $today = now()->startOfDay();
                $loadDate = $lockedLoad->load_date ? \Carbon\Carbon::parse($lockedLoad->load_date)->startOfDay() : $today;
                $deliveryDate = $loadDate->greaterThan($today) ? $loadDate : $today;

                $updatePayload = [
                    'status' => 'delivered',
                    'delivery_date' => $deliveryDate->toDateString(),
                ];

                // Backward compatibility: allow completion even before new column migration is applied.
                if (Schema::hasColumn('loads', 'has_vehicle_balance')) {
                    $updatePayload['has_vehicle_balance'] = $remainingQty > 0;
                }

                $lockedLoad->update($updatePayload);
            });
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => $addBalanceToMainStock
                ? 'Load completed and remaining vehicle quantities moved to main stock.'
                : 'Load completed without stock return. Remaining balance is marked in vehicle.',
            'load' => $load->fresh(['vehicle', 'driver', 'salesRef', 'route']),
        ]);
    }
}
