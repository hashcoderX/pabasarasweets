<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionPayment;
use App\Models\Employee;
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
    private function resolveAccessibleEmployeeIds(int $employeeId): array
    {
        $accessible = [$employeeId];
        $frontier = [$employeeId];
        $visited = [$employeeId => true];
        $maxDepth = 12;
        $depth = 0;

        while (!empty($frontier) && $depth < $maxDepth) {
            $childIds = Employee::query()
                ->whereIn('reporting_person_id', $frontier)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $nextFrontier = [];
            foreach ($childIds as $childId) {
                if (isset($visited[$childId])) {
                    continue;
                }

                $visited[$childId] = true;
                $accessible[] = $childId;
                $nextFrontier[] = $childId;
            }

            $frontier = $nextFrontier;
            $depth++;
        }

        return $accessible;
    }

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
                $accessibleEmployeeIds = $this->resolveAccessibleEmployeeIds((int) $user->employee_id);
                $query->whereIn('sales_ref_id', $accessibleEmployeeIds);
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

        $invoiceQuery = DistributionInvoice::with(['customer:id,shop_name,customer_code,route_id', 'items'])
            ->whereNotIn('status', ['cancelled', 'deleted']);

        if (Schema::hasColumn('distribution_invoices', 'load_id')) {
            // Primary source: invoices explicitly linked to this load.
            $invoiceQuery->where('load_id', $load->id);
        } else {
            // Legacy fallback when load_id column does not exist.
            $invoiceQuery
                ->whereBetween('invoice_date', [$fromDate, $toDate])
                ->whereHas('customer', function ($q) use ($routeIds) {
                    $q->whereIn('route_id', $routeIds);
                });
        }

        $invoices = $invoiceQuery
            ->get(['id', 'invoice_number', 'customer_id', 'invoice_date', 'subtotal', 'discount', 'total', 'status', 'paid_amount']);

        $invoiceTotal = (float) $invoices->sum('total');
        $invoiceCount = $invoices->count();
        $invoiceOutstanding = (float) $invoices->reduce(function ($sum, $invoice) {
            $due = max(0, (float) $invoice->total - (float) $invoice->paid_amount);
            return $sum + $due;
        }, 0);

        $invoiceIds = $invoices->pluck('id')->filter()->unique()->values();

        if ($invoiceIds->isEmpty()) {
            $payments = collect([]);
        } else {
            $paymentQuery = DistributionPayment::query()
                ->whereNotIn('status', ['bounced', 'returned', 'closed'])
                ->where(function ($q) use ($invoiceIds, $load) {
                    $q->whereIn('distribution_invoice_id', $invoiceIds->all());

                    if (Schema::hasColumn('distribution_payments', 'load_id')) {
                        $q->orWhere(function ($sub) use ($load) {
                            $sub->where('load_id', $load->id)
                                ->whereNull('distribution_invoice_id');
                        });
                    }
                });

            $payments = $paymentQuery->get([
                'id',
                'payment_number',
                'payment_date',
                'amount',
                'payment_method',
                'reference_no',
                'bank_name',
                'status',
            ]);
        }

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
            $invoiceDiscount = (float) ($invoice->discount ?? 0);
            $lineValueMap = [];
            $invoiceLineNetBeforeHeaderDiscount = 0.0;

            foreach ($invoice->items as $item) {
                $itemId = (int) ($item->id ?? 0);
                $grossLineValue = (float) $item->quantity * (float) $item->unit_price;
                $itemLevelDiscount = (float) ($item->discount ?? 0);
                $lineValueAfterItemDiscount = max(0, $grossLineValue - $itemLevelDiscount);

                $lineValueMap[$itemId] = $lineValueAfterItemDiscount;
                $invoiceLineNetBeforeHeaderDiscount += $lineValueAfterItemDiscount;
            }

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
                        'exchange_return_qty' => 0.0,
                        'damaged_return_qty' => 0.0,
                        'return_value' => 0.0,
                        'net_qty' => 0.0,
                        'net_value' => 0.0,
                        'cost_value' => 0.0,
                        'profit' => 0.0,
                    ];
                }

                $itemSales[$code]['sold_qty'] += (float) $item->quantity;

                $itemId = (int) ($item->id ?? 0);
                $lineValueAfterItemDiscount = (float) ($lineValueMap[$itemId] ?? 0.0);
                $headerDiscountShare = $invoiceLineNetBeforeHeaderDiscount > 0
                    ? ($invoiceDiscount * ($lineValueAfterItemDiscount / $invoiceLineNetBeforeHeaderDiscount))
                    : 0.0;
                $netLineValue = max(0, $lineValueAfterItemDiscount - $headerDiscountShare);

                $itemSales[$code]['sold_value'] += $netLineValue;
            }
        }

        // Returns should include both invoice-linked records and direct load-linked records.
        $returnsHasLoadId = Schema::hasColumn('distribution_returns', 'load_id');
        $returnsQuery = \App\Models\DistributionReturn::query()
            ->with([
                'customer:id,shop_name,customer_code',
                'invoice:id,invoice_number',
                'returnedItem:id,name,code,unit',
                'exchangeItem:id,name,code,unit',
            ]);

        $returnsQuery->where(function ($q) use ($invoiceIds, $load, $returnsHasLoadId) {
            if (!$invoiceIds->isEmpty()) {
                $q->whereIn('distribution_invoice_id', $invoiceIds->all());
            }

            if ($returnsHasLoadId) {
                if (!$invoiceIds->isEmpty()) {
                    $q->orWhere('load_id', $load->id);
                } else {
                    $q->where('load_id', $load->id);
                }
            }
        });

        $returnColumns = [
            'id',
            'return_number',
            'distribution_invoice_id',
            'customer_id',
            'returned_inventory_item_id',
            'exchange_inventory_item_id',
            'return_date',
            'total_quantity',
            'total_amount',
            'settlement_type',
            'settlement_amount',
            'exchange_quantity',
            'reason',
            'status',
            'notes',
        ];

        if ($returnsHasLoadId) {
            $returnColumns[] = 'load_id';
        }

        $returns = $returnsQuery->get($returnColumns);

        foreach ($returns as $return) {
            $settlementType = strtolower((string) ($return->settlement_type ?? ''));
            $isExchangeSettlement = $settlementType === 'item_exchange';
            $isDamagedReason = strtolower((string) ($return->reason ?? '')) === 'damaged_items';

            $lineEntries = $this->resolveReturnLineEntriesFromNotes((string) ($return->notes ?? ''));
            if (!empty($lineEntries)) {
                foreach ($lineEntries as $entry) {
                    $code = trim((string) ($entry['item_code'] ?? ''));
                    if ($code === '') {
                        continue;
                    }

                    if (!isset($itemSales[$code])) {
                        $itemSales[$code] = [
                            'item_code' => $code,
                            'item_name' => trim((string) ($entry['item_name'] ?? '')) !== '' ? trim((string) ($entry['item_name'] ?? '')) : $code,
                            'unit' => $return->returnedItem?->unit ?? null,
                            'sold_qty' => 0.0,
                            'sold_value' => 0.0,
                            'return_qty' => 0.0,
                            'exchange_return_qty' => 0.0,
                            'damaged_return_qty' => 0.0,
                            'return_value' => 0.0,
                            'net_qty' => 0.0,
                            'net_value' => 0.0,
                            'cost_value' => 0.0,
                            'profit' => 0.0,
                        ];
                    }

                    $entryQty = max(0, (float) ($entry['quantity'] ?? 0));
                    $entryAmount = max(0, (float) ($entry['amount'] ?? 0));
                    if ($entryAmount <= 0) {
                        $entryAmount = $entryQty * max(0, (float) ($entry['unit_price'] ?? 0));
                    }

                    $isExchange = $isExchangeSettlement || !empty($entry['is_exchange']);
                    $isDamaged = $isDamagedReason || !empty($entry['is_damaged']);

                    $itemSales[$code]['return_qty'] += $entryQty;
                    $itemSales[$code]['return_value'] += $entryAmount;
                    if ($isExchange) {
                        $itemSales[$code]['exchange_return_qty'] += $entryQty;
                    }
                    if ($isDamaged) {
                        $itemSales[$code]['damaged_return_qty'] += $entryQty;
                    }
                }

                continue;
            }

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
                    'exchange_return_qty' => 0.0,
                    'damaged_return_qty' => 0.0,
                    'return_value' => 0.0,
                    'net_qty' => 0.0,
                    'net_value' => 0.0,
                    'cost_value' => 0.0,
                    'profit' => 0.0,
                ];
            }

            $fallbackQty = (float) $return->total_quantity;
            $itemSales[$code]['return_qty'] += $fallbackQty;
            $itemSales[$code]['return_value'] += (float) $return->total_amount;
            if ($isExchangeSettlement) {
                $itemSales[$code]['exchange_return_qty'] += $fallbackQty;
            }
            if ($isDamagedReason) {
                $itemSales[$code]['damaged_return_qty'] += $fallbackQty;
            }
        }

        // Map to collection for further calculations.
        $itemSalesCollection = collect($itemSales);

        // Attach cost from load items (out_price) and compute profit per item.
        $loadItems = $load->loadItems()->get(['product_code', 'out_price', 'sell_price']);
        $itemSalesCollection = $itemSalesCollection->map(function (array $row, string $code) use ($loadItems) {
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

            return $row;
        });

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
                    'total_outstanding' => $invoiceOutstanding,
                    'total_cost' => $totalCost,
                    'total_profit' => $totalProfit,
                ],
                'payments' => [
                    'total_collected' => $totalCollected,
                    'by_method' => $byMethod,
                    'cheques' => $cheques,
                ],
                'returns' => $returns->values(),
                'items' => $itemSalesCollection->values(),
            ],
        ]);
    }

    private function resolveReturnLineEntriesFromNotes(string $notes): array
    {
        if (trim($notes) === '') {
            return [];
        }

        $entries = [];
        $lines = preg_split('/\r\n|\r|\n/', $notes) ?: [];
        foreach ($lines as $line) {
            $trimmed = trim((string) $line);
            if (!str_starts_with($trimmed, '- ')) {
                continue;
            }

            if (!preg_match('/^-\s*([0-9]+(?:\.[0-9]+)?)\s*x\s*(.*?)\s*\(([^)]+)\)\s*@\s*([0-9]+(?:\.[0-9]+)?)(?:\s*=>\s*amount\s*([0-9]+(?:\.[0-9]+)?))?(.*)$/i', $trimmed, $matches)) {
                continue;
            }

            $tail = strtoupper((string) ($matches[6] ?? ''));
            $entries[] = [
                'quantity' => (float) ($matches[1] ?? 0),
                'item_name' => trim((string) ($matches[2] ?? '')),
                'item_code' => trim((string) ($matches[3] ?? '')),
                'unit_price' => (float) ($matches[4] ?? 0),
                'amount' => (float) ($matches[5] ?? 0),
                'is_damaged' => str_contains($tail, '[DAMAGED]'),
                'is_exchange' => str_contains($tail, '[EXCHANGE]'),
            ];
        }

        return $entries;
    }

    public function complete(Request $request, Load $load): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'add_balance_to_main_stock' => 'required|boolean',
            'add_collected_cash_to_main_account' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $addBalanceToMainStock = (bool) $request->boolean('add_balance_to_main_stock');
        $addCollectedCashToMainAccount = (bool) $request->boolean('add_collected_cash_to_main_account');

        if (in_array($load->status, ['delivered', 'cancelled'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'This load is already completed or cancelled.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($request, $load, $addBalanceToMainStock, $addCollectedCashToMainAccount) {
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

                $cashCollectedForLoad = (float) DistributionPayment::query()
                    ->where('load_id', $lockedLoad->id)
                    ->whereRaw("LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'")
                    ->where(function ($query) {
                        $query->whereNull('status')
                            ->orWhereRaw("LOWER(TRIM(status)) != 'closed'");
                    })
                    ->sum('amount');

                if ($addCollectedCashToMainAccount && $cashCollectedForLoad > 0) {
                    if (!Schema::hasTable('delivery_completion_cash_transfers')) {
                        throw ValidationException::withMessages([
                            'add_collected_cash_to_main_account' => ['Delivery completion cash transfer table is not available. Please run database migrations.'],
                        ]);
                    }

                    DB::table('delivery_completion_cash_transfers')->insert([
                        'load_id' => $lockedLoad->id,
                        'load_number' => (string) $lockedLoad->load_number,
                        'delivery_date' => $deliveryDate->toDateString(),
                        'amount' => $cashCollectedForLoad,
                        'status' => 'pending',
                        'requested_at' => now(),
                        'requested_by' => $request->user()?->id,
                        'note' => sprintf(
                            'Pending transfer from Delivery Cash to Main Cash. Load %s completed.',
                            $lockedLoad->load_number
                        ),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
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
                ? ($addCollectedCashToMainAccount
                    ? 'Load completed, remaining vehicle quantities moved to main stock, and collected cash sent for main account acceptance.'
                    : 'Load completed and remaining vehicle quantities moved to main stock.')
                : ($addCollectedCashToMainAccount
                    ? 'Load completed, and collected cash sent for main account acceptance. Remaining balance is marked in vehicle.'
                    : 'Load completed without stock return. Remaining balance is marked in vehicle.'),
            'load' => $load->fresh(['vehicle', 'driver', 'salesRef', 'route']),
        ]);
    }
}
