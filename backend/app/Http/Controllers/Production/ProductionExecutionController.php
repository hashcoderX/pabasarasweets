<?php

namespace App\Http\Controllers\Production;

use App\Http\Controllers\Controller;
use App\Models\BomHeader;
use App\Models\InventoryItem;
use App\Models\ProductionOrder;
use App\Models\ProductionPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class ProductionExecutionController extends Controller
{
    public function queue(): JsonResponse
    {
        $queue = ProductionPlan::with(['product:id,name,code,unit', 'bom:id,product_id,version,batch_size'])
            ->whereIn('status', ['scheduled', 'order_created'])
            ->orderBy('plan_date')
            ->orderByDesc('priority')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $queue,
            'message' => 'Execution queue retrieved successfully',
        ]);
    }

    public function activeBatches(): JsonResponse
    {
        $latestStartedPerPlan = ProductionOrder::query()
            ->selectRaw('MAX(id)')
            ->where('status', 'started')
            ->whereNotNull('production_plan_id')
            ->groupBy('production_plan_id');

        $orders = ProductionOrder::with([
            'product:id,name,code,unit',
            'bom:id,product_id,version,batch_size',
            'plan:id,plan_date,shift,order_number,status',
        ])
            ->where('status', 'started')
            ->whereNotNull('production_plan_id')
            ->whereHas('plan')
            ->whereIn('id', $latestStartedPerPlan)
            ->orderByDesc('started_at')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $orders,
            'message' => 'Active production batches retrieved successfully',
        ]);
    }

    public function batchHistory(Request $request): JsonResponse
    {
        $query = ProductionOrder::with([
            'product:id,name,code,unit',
            'bom:id,product_id,version,batch_size',
            'plan:id,plan_date,shift,order_number,status',
        ])->whereIn('status', ['completed', 'cancelled']);

        if ($request->filled('from_date')) {
            $query->whereDate('started_at', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('started_at', '<=', $request->to_date);
        }

        if ($request->filled('status') && in_array($request->status, ['completed', 'cancelled'], true)) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->whereHas('product', function ($p) use ($search) {
                    $p->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%");
                })->orWhereHas('plan', function ($plan) use ($search) {
                    $plan->where('order_number', 'like', "%{$search}%");
                });
            });
        }

        $rows = $query->orderByDesc('updated_at')->paginate((int) $request->get('per_page', 100));

        return response()->json([
            'success' => true,
            'data' => [
                'data' => $rows->items(),
                'meta' => [
                    'current_page' => $rows->currentPage(),
                    'last_page' => $rows->lastPage(),
                    'per_page' => $rows->perPage(),
                    'total' => $rows->total(),
                ],
            ],
            'message' => 'Batch history retrieved successfully',
        ]);
    }

    public function startBatch(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'production_plan_id' => 'required|exists:production_plans,id',
            'machine_name' => 'nullable|string|max:100',
            'workstation_name' => 'nullable|string|max:100',
            'worker_name' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $order = DB::transaction(function () use ($request) {
                $plan = ProductionPlan::where('id', (int) $request->production_plan_id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if (!in_array($plan->status, ['scheduled', 'order_created'], true)) {
                    throw ValidationException::withMessages([
                        'production_plan_id' => ['This plan is already started or no longer available in queue.'],
                    ]);
                }

                $existingStarted = ProductionOrder::where('production_plan_id', $plan->id)
                    ->where('status', 'started')
                    ->exists();

                if ($existingStarted) {
                    throw ValidationException::withMessages([
                        'production_plan_id' => ['An active batch already exists for this production plan.'],
                    ]);
                }

                $plan->load(['product', 'bom.items.material.inventoryItem']);

                $bom = $plan->bom;
                if (!$bom) {
                    $bom = BomHeader::with(['items.material.inventoryItem'])
                        ->where('product_id', $plan->product_id)
                        ->where('is_active', true)
                        ->orderByDesc('id')
                        ->first();
                }

                if (!$bom) {
                    throw ValidationException::withMessages([
                        'production_plan_id' => ['No BOM found for this plan/product.'],
                    ]);
                }

                if ((float) $bom->batch_size <= 0) {
                    throw ValidationException::withMessages([
                        'production_plan_id' => ['BOM batch size must be greater than zero.'],
                    ]);
                }

                $productionQuantity = (float) $plan->target_quantity;
                $multiplier = $productionQuantity / (float) $bom->batch_size;
                $baseRequirements = $bom->items->map(function ($item) use ($multiplier) {
                    return [
                        'material_id' => $item->material_id,
                        'inventory_item_id' => (int) $item->material->inventory_item_id,
                        'material_name' => (string) $item->material->inventoryItem->name,
                        'material_code' => (string) $item->material->inventoryItem->code,
                        'unit' => (string) $item->unit,
                        'required_quantity' => round((float) $item->quantity * $multiplier, 4),
                    ];
                })->values()->all();

                $inventoryIds = collect($baseRequirements)->pluck('inventory_item_id')->unique()->values();
                $stockMap = InventoryItem::whereIn('id', $inventoryIds)->lockForUpdate()->get()->keyBy('id');

                $requirements = collect($baseRequirements)->map(function ($row) use ($stockMap) {
                    $stockItem = $stockMap->get((int) $row['inventory_item_id']);
                    $available = (float) ($stockItem?->current_stock ?? 0);

                    if (!$stockItem || $available < (float) $row['required_quantity']) {
                        throw ValidationException::withMessages([
                            'production_plan_id' => [
                                "Insufficient stock for {$row['material_code']} - {$row['material_name']}. Required {$row['required_quantity']} {$row['unit']}, available {$available} {$row['unit']}."
                            ],
                        ]);
                    }

                    $stockItem->current_stock = round($available - (float) $row['required_quantity'], 2);
                    $stockItem->save();

                    $row['available_before'] = $available;
                    $row['available_after'] = (float) $stockItem->current_stock;
                    return $row;
                })->values()->all();

                $batchNo = $this->generateBatchNo((string) ($plan->product?->code ?? 'PRD'));

                $order = ProductionOrder::create([
                    'production_plan_id' => $plan->id,
                    'batch_no' => $batchNo,
                    'product_id' => $plan->product_id,
                    'bom_id' => $bom->id,
                    'production_quantity' => $productionQuantity,
                    'produced_quantity' => 0,
                    'wastage_quantity' => 0,
                    'batch_size' => (float) $bom->batch_size,
                    'multiplier' => round($multiplier, 4),
                    'machine_name' => $request->machine_name,
                    'workstation_name' => $request->workstation_name,
                    'worker_name' => $request->worker_name,
                    'status' => 'started',
                    'material_requirements' => $requirements,
                    'actual_material_consumption' => $requirements,
                    'started_at' => now(),
                    'notes' => $request->notes,
                ]);

                $plan->update(['status' => 'in_progress']);

                return $order;
            });

            return response()->json([
                'success' => true,
                'data' => $order->load(['product:id,name,code,unit', 'bom:id,product_id,version,batch_size', 'plan:id,plan_date,shift,order_number,status']),
                'message' => 'Production batch started and materials consumed successfully',
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot start batch due to insufficient materials',
                'errors' => $e->errors(),
            ], 422);
        }
    }

    public function updateBatch(Request $request, int $id): JsonResponse
    {
        $order = ProductionOrder::with('plan')->find($id);
        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Production batch not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:started,completed,cancelled',
            'machine_name' => 'nullable|string|max:100',
            'workstation_name' => 'nullable|string|max:100',
            'worker_name' => 'nullable|string|max:100',
            'produced_quantity' => 'nullable|numeric|min:0',
            'wastage_quantity' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $status = $request->status;
        $payload = [
            'status' => $status,
            'machine_name' => $request->machine_name ?? $order->machine_name,
            'workstation_name' => $request->workstation_name ?? $order->workstation_name,
            'worker_name' => $request->worker_name ?? $order->worker_name,
            'produced_quantity' => $request->has('produced_quantity') ? (float) $request->produced_quantity : $order->produced_quantity,
            'wastage_quantity' => $request->has('wastage_quantity') ? (float) $request->wastage_quantity : $order->wastage_quantity,
            'notes' => $request->notes ?? $order->notes,
        ];

        if ($status === 'completed') {
            $payload['completed_at'] = now();
            $payload['cancelled_at'] = null;
        }

        if ($status === 'cancelled') {
            $payload['cancelled_at'] = now();
        }

        DB::transaction(function () use ($order, $payload, $status) {
            $order->update($payload);

            if ($order->plan) {
                if ($status === 'completed') {
                    $order->plan->update(['status' => 'completed']);
                } elseif ($status === 'cancelled') {
                    $order->plan->update(['status' => 'cancelled']);
                } else {
                    $order->plan->update(['status' => 'in_progress']);
                }
            }
        });

        return response()->json([
            'success' => true,
            'data' => $order->fresh(['product:id,name,code,unit', 'bom:id,product_id,version,batch_size', 'plan:id,plan_date,shift,order_number,status']),
            'message' => 'Production batch updated successfully',
        ]);
    }

    private function generateBatchNo(string $productCode): string
    {
        $datePart = now()->format('Ymd');
        $code = strtoupper(preg_replace('/[^A-Z0-9]/', '', $productCode));
        $prefix = ($code ? substr($code, 0, 6) : 'PRD') . '-' . $datePart;

        $count = ProductionOrder::whereDate('created_at', now()->toDateString())
            ->whereNotNull('batch_no')
            ->count() + 1;

        return 'BATCH-' . $prefix . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }
}
