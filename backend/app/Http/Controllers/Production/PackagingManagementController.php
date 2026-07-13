<?php

namespace App\Http\Controllers\Production;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\PackagingBatch;
use App\Models\QcInspection;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class PackagingManagementController extends Controller
{
    public function approvedQcBatches(Request $request): JsonResponse
    {
        $query = QcInspection::with([
            'productionOrder:id,product_id,batch_no,produced_quantity,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
        ])->where('quality_status', 'approved');

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->whereHas('productionOrder.product', function ($p) use ($search) {
                    $p->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%");
                })->orWhereHas('productionOrder.plan', function ($plan) use ($search) {
                    $plan->where('order_number', 'like', "%{$search}%");
                });
            });
        }

        $rows = $query->orderByDesc('inspection_date')->orderByDesc('id')->paginate((int) $request->get('per_page', 100));

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
            'message' => 'Approved QC batches retrieved successfully',
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = PackagingBatch::with([
            'qcInspection:id,production_order_id,inspection_date,quality_status,approved_quantity',
            'productionOrder:id,product_id,batch_no,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
        ]);

        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('label_code', 'like', "%{$search}%")
                    ->orWhere('barcode_value', 'like', "%{$search}%")
                    ->orWhere('qr_value', 'like', "%{$search}%")
                    ->orWhereHas('productionOrder.product', function ($p) use ($search) {
                        $p->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
                    });
            });
        }

        $rows = $query->orderByDesc('created_at')->paginate((int) $request->get('per_page', 100));

        $summary = [
            'total_batches' => (clone $query)->count(),
            'planned_batches' => (clone $query)->where('status', 'planned')->count(),
            'packed_batches' => (clone $query)->where('status', 'packed')->count(),
            'dispatched_batches' => (clone $query)->where('status', 'dispatched')->count(),
            'total_packed_quantity' => round((float) (clone $query)->sum('packed_quantity'), 3),
        ];

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
                'summary' => $summary,
            ],
            'message' => 'Packaging batches retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'qc_inspection_id' => 'required|exists:qc_inspections,id',
            'packaging_material_name' => 'required|string|max:150',
            'packaging_material_quantity' => 'required|numeric|min:0',
            'packaging_material_unit' => 'required|string|max:30',
            'packed_quantity' => 'required|numeric|min:0',
            'unit_price' => 'nullable|numeric|min:0',
            'selling_price' => 'nullable|numeric|min:0',
            'expiry_date' => 'nullable|date',
            'status' => 'nullable|in:planned,packed,dispatched',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $inspection = QcInspection::with('productionOrder.product')->findOrFail((int) $request->qc_inspection_id);

        if ($inspection->quality_status !== 'approved') {
            return response()->json([
                'success' => false,
                'message' => 'Only approved QC batches can be packed.',
            ], 422);
        }

        $labelCode = $this->generateLabelCode($inspection->productionOrder?->product?->code ?? 'PACK');
        $barcode = $this->generateBarcodeValue($inspection->production_order_id, $labelCode);
        $qr = $this->generateQrValue($inspection->production_order_id, $labelCode);

        $status = $request->status ?? 'planned';
        $packedAt = in_array($status, ['packed', 'dispatched'], true) ? now() : null;

        $batch = DB::transaction(function () use ($inspection, $request, $status, $labelCode, $barcode, $qr, $packedAt) {
            $created = PackagingBatch::create([
                'qc_inspection_id' => $inspection->id,
                'production_order_id' => $inspection->production_order_id,
                'batch_no' => $inspection->productionOrder?->batch_no,
                'packaging_material_name' => $request->packaging_material_name,
                'packaging_material_quantity' => $request->packaging_material_quantity,
                'packaging_material_unit' => $request->packaging_material_unit,
                'packed_quantity' => $request->packed_quantity,
                'unit_price' => $request->unit_price ?? 0,
                'selling_price' => $request->selling_price ?? 0,
                'status' => $status,
                'label_code' => $labelCode,
                'barcode_value' => $barcode,
                'qr_value' => $qr,
                'packed_at' => $packedAt,
                'expiry_date' => $request->expiry_date,
                'notes' => $request->notes,
            ]);

            if (in_array($status, ['packed', 'dispatched'], true)) {
                $this->syncBatchToMainStore($created);
            }

            return $created;
        });

        $batch = $batch->load([
            'qcInspection:id,production_order_id,inspection_date,quality_status,approved_quantity',
            'productionOrder:id,product_id,batch_no,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
        ]);

        return response()->json([
            'success' => true,
            'data' => $batch,
            'message' => 'Packaging batch created successfully',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $batch = PackagingBatch::find($id);
        if (!$batch) {
            return response()->json([
                'success' => false,
                'message' => 'Packaging batch not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'packaging_material_name' => 'sometimes|string|max:150',
            'packaging_material_quantity' => 'sometimes|numeric|min:0',
            'packaging_material_unit' => 'sometimes|string|max:30',
            'packed_quantity' => 'sometimes|numeric|min:0',
            'unit_price' => 'sometimes|numeric|min:0',
            'selling_price' => 'sometimes|numeric|min:0',
            'expiry_date' => 'nullable|date',
            'status' => 'sometimes|in:planned,packed,dispatched',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        DB::transaction(function () use ($request, $batch) {
            $payload = $request->only([
                'packaging_material_name',
                'packaging_material_quantity',
                'packaging_material_unit',
                'packed_quantity',
                'unit_price',
                'selling_price',
                'expiry_date',
                'status',
                'notes',
            ]);

            if ($request->filled('status') && in_array($request->status, ['packed', 'dispatched'], true)) {
                $payload['packed_at'] = now();
            }

            $previousSyncedQty = (float) ($batch->main_store_synced_quantity ?? 0);
            $batch->update($payload);
            $batch->refresh();

            if (in_array($batch->status, ['packed', 'dispatched'], true)) {
                $this->syncBatchToMainStore($batch, $previousSyncedQty);
            }
        });

        return response()->json([
            'success' => true,
            'data' => $batch->fresh([
                'qcInspection:id,production_order_id,inspection_date,quality_status,approved_quantity',
                'productionOrder:id,product_id,batch_no,status,started_at,completed_at',
                'productionOrder.product:id,name,code,unit',
                'productionOrder.plan:id,order_number,plan_date,shift',
            ]),
            'message' => 'Packaging batch updated successfully',
        ]);
    }

    private function generateLabelCode(string $productCode): string
    {
        $datePart = now()->format('Ymd');
        $prefix = strtoupper(trim($productCode)) ?: 'PACK';
        $base = "LBL-{$prefix}-{$datePart}";

        $count = PackagingBatch::whereDate('created_at', now()->toDateString())->count() + 1;
        return $base . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }

    private function generateBarcodeValue(int $productionOrderId, string $labelCode): string
    {
        return 'BAR-' . $productionOrderId . '-' . strtoupper(substr(md5($labelCode), 0, 8));
    }

    private function generateQrValue(int $productionOrderId, string $labelCode): string
    {
        return 'QR|' . $productionOrderId . '|' . $labelCode;
    }

    private function syncBatchToMainStore(PackagingBatch $batch, float $previousSyncedQty = 0): void
    {
        $batch->loadMissing('productionOrder.product');

        $product = $batch->productionOrder?->product;
        if (!$product) {
            return;
        }

        $targetSyncedQty = (float) ($batch->packed_quantity ?? 0);
        $delta = round($targetSyncedQty - $previousSyncedQty, 3);
        if ($delta <= 0) {
            if (!$batch->main_store_synced_at) {
                $batch->update([
                    'main_store_synced_at' => now(),
                    'main_store_synced_quantity' => $targetSyncedQty,
                ]);
            }
            return;
        }

        $item = InventoryItem::where('type', 'finished_good')
            ->where(function ($query) use ($product) {
                $query->where('code', $product->code)
                    ->orWhere(function ($subQuery) use ($product) {
                        $subQuery->where('name', $product->name)
                            ->where('unit', $product->unit);
                    });
            })
            ->first();

        if (!$item) {
            $inventoryCode = $product->code;
            if (InventoryItem::where('code', $inventoryCode)->exists()) {
                $inventoryCode = 'FG-' . $product->code;
                $suffix = 1;
                while (InventoryItem::where('code', $inventoryCode)->exists()) {
                    $inventoryCode = 'FG-' . $product->code . '-' . $suffix;
                    $suffix++;
                }
            }

            $item = InventoryItem::create([
                'name' => $product->name,
                'code' => $inventoryCode,
                'description' => 'Finished good generated from production packaging flow.',
                'type' => 'finished_good',
                'category' => 'Main Store',
                'unit' => $product->unit ?: 'pcs',
                'current_stock' => 0,
                'minimum_stock' => 0,
                'maximum_stock' => null,
                'unit_price' => 0,
                'location' => 'Main Store',
                'status' => 'active',
            ]);
        }

        $info = $item->additional_info ?? [];
        $info['store_tag'] = 'main_store';
        $info['stock_source'] = 'packaging';
        $info['production_product_id'] = $product->id;
        $info['last_batch_no'] = $batch->batch_no;
        $info['last_packaging_batch_id'] = $batch->id;
        $info['last_label_code'] = $batch->label_code;
        $info['last_barcode_value'] = $batch->barcode_value;
        $info['last_qr_value'] = $batch->qr_value;
        $info['last_batch_unit_price'] = (float) ($batch->unit_price ?? 0);
        $info['last_batch_selling_price'] = (float) ($batch->selling_price ?? 0);
        $info['last_batch_expiry_date'] = optional($batch->expiry_date)->toDateString();
        $info['last_synced_at'] = Carbon::now()->toDateTimeString();

        $item->current_stock = round((float) $item->current_stock + $delta, 3);
        if ((float) ($batch->unit_price ?? 0) > 0) {
            $item->unit_price = (float) $batch->unit_price;
            $item->purchase_price = (float) $batch->unit_price;
        }
        if ((float) ($batch->selling_price ?? 0) > 0) {
            $item->sell_price = (float) $batch->selling_price;
        }
        if ($batch->expiry_date) {
            $item->expiry_date = $batch->expiry_date;
        }
        $item->additional_info = $info;
        $item->save();

        $batch->update([
            'main_store_synced_at' => now(),
            'main_store_synced_quantity' => $targetSyncedQty,
        ]);
    }
}
