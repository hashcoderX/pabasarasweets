<?php

namespace App\Http\Controllers\Production;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\PackagingBatch;
use App\Models\QcInspection;
use App\Models\RawMaterial;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class PackagingManagementController extends Controller
{
    public function approvedQcBatches(Request $request): JsonResponse
    {
        $packedQtyExpr = "COALESCE((SELECT SUM(pb.packed_quantity * COALESCE(NULLIF(pb.packaging_material_quantity, 0), 1)) FROM packaging_batches pb WHERE pb.qc_inspection_id = qc_inspections.id AND pb.status IN ('packed','dispatched')), 0)";

        $query = QcInspection::with([
            'productionOrder:id,product_id,batch_no,produced_quantity,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
        ])
            ->select('qc_inspections.*')
            ->selectRaw("{$packedQtyExpr} as packed_quantity_total")
            ->selectRaw("GREATEST(qc_inspections.approved_quantity - {$packedQtyExpr}, 0) as balance_quantity")
            ->where('quality_status', 'approved')
            ->whereRaw("qc_inspections.approved_quantity - {$packedQtyExpr} > 0");

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
            'materials:id,packaging_batch_id,raw_material_id,inventory_item_id,material_name,material_code,material_unit,quantity_per_pack,consumed_quantity',
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
            'final_product_name' => 'required|string|max:180',
            'packaging_material_name' => 'nullable|string|max:150',
            'packaging_material_quantity' => 'nullable|numeric|min:0',
            'packaging_material_unit' => 'nullable|string|max:30',
            'materials' => 'required|array|min:1',
            'materials.*.raw_material_id' => 'required|exists:raw_materials,id',
            'materials.*.quantity_per_pack' => 'required|numeric|min:0.0001',
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

        $status = $request->status ?? 'planned';
        if (in_array($status, ['packed', 'dispatched'], true)) {
            $alreadyPacked = (float) PackagingBatch::where('qc_inspection_id', $inspection->id)
                ->whereIn('status', ['packed', 'dispatched'])
                ->selectRaw('COALESCE(SUM(packed_quantity * COALESCE(NULLIF(packaging_material_quantity, 0), 1)), 0) as consumed_qty')
                ->value('consumed_qty');
            $availableBalance = round(max(0, (float) ($inspection->approved_quantity ?? 0) - $alreadyPacked), 3);
            $requestedPackedQty = round((float) $request->packed_quantity, 3);
            $requestedPackSizeQty = round((float) ($request->packaging_material_quantity ?? 1), 3);
            if ($requestedPackSizeQty <= 0) {
                $requestedPackSizeQty = 1;
            }
            $requestedConsumedQty = round($requestedPackedQty * $requestedPackSizeQty, 3);
            if ($requestedConsumedQty > $availableBalance) {
                return response()->json([
                    'success' => false,
                    'message' => 'Packed quantity exceeds available approved balance for this QC batch.',
                    'errors' => [
                        'packed_quantity' => ["Available balance is {$availableBalance} after applying pack size quantity."],
                    ],
                ], 422);
            }
        }

        $labelCode = $this->generateLabelCode($inspection->productionOrder?->product?->code ?? 'PACK');
        $barcode = $this->generateBarcodeValue($inspection->production_order_id, $labelCode);
        $qr = $this->generateQrValue($inspection->production_order_id, $labelCode);

        $packedAt = in_array($status, ['packed', 'dispatched'], true) ? now() : null;

        $materialPayload = collect($request->materials)
            ->map(function ($line) {
                return [
                    'raw_material_id' => (int) ($line['raw_material_id'] ?? 0),
                    'quantity_per_pack' => (float) ($line['quantity_per_pack'] ?? 0),
                ];
            })
            ->filter(fn ($line) => $line['raw_material_id'] > 0 && $line['quantity_per_pack'] > 0)
            ->values();

        if ($materialPayload->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => [
                    'materials' => ['Add at least one packaging raw material line.'],
                ],
            ], 422);
        }

        if ($materialPayload->pluck('raw_material_id')->unique()->count() !== $materialPayload->count()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => [
                    'materials' => ['Duplicate raw materials are not allowed in one packaging batch.'],
                ],
            ], 422);
        }

        $rawMaterials = RawMaterial::with('inventoryItem')
            ->whereIn('id', $materialPayload->pluck('raw_material_id')->all())
            ->get()
            ->keyBy('id');

        $summary = $this->buildMaterialSummary($materialPayload->all(), $rawMaterials);

        $batch = DB::transaction(function () use ($inspection, $request, $status, $labelCode, $barcode, $qr, $packedAt, $summary, $materialPayload, $rawMaterials) {
            $created = PackagingBatch::create([
                'qc_inspection_id' => $inspection->id,
                'production_order_id' => $inspection->production_order_id,
                'batch_no' => $inspection->productionOrder?->batch_no,
                'final_product_name' => trim((string) $request->final_product_name),
                'packaging_material_name' => $request->packaging_material_name ?: $summary['name'],
                'packaging_material_quantity' => $request->packaging_material_quantity ?? $summary['qty'],
                'packaging_material_unit' => $request->packaging_material_unit ?: $summary['unit'],
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

            $materialsToSave = $materialPayload->map(function ($line) use ($rawMaterials) {
                $raw = $rawMaterials->get((int) $line['raw_material_id']);
                $inv = $raw?->inventoryItem;
                return [
                    'raw_material_id' => (int) $line['raw_material_id'],
                    'inventory_item_id' => (int) ($raw?->inventory_item_id ?? 0),
                    'material_name' => (string) ($inv?->name ?? ('Material #' . (int) $line['raw_material_id'])),
                    'material_code' => (string) ($inv?->code ?? ''),
                    'material_unit' => (string) ($inv?->unit ?? ''),
                    'quantity_per_pack' => (float) $line['quantity_per_pack'],
                    'consumed_quantity' => 0,
                ];
            })->all();

            $created->materials()->createMany($materialsToSave);

            if (in_array($status, ['packed', 'dispatched'], true)) {
                $this->syncBatchToMainStore($created);
            }

            $this->syncBatchPackagingMaterials($created, in_array($status, ['packed', 'dispatched'], true) ? (float) $created->packed_quantity : 0);

            return $created;
        });

        $batch = $batch->load([
            'qcInspection:id,production_order_id,inspection_date,quality_status,approved_quantity',
            'productionOrder:id,product_id,batch_no,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
            'materials:id,packaging_batch_id,raw_material_id,inventory_item_id,material_name,material_code,material_unit,quantity_per_pack,consumed_quantity',
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
            'final_product_name' => 'sometimes|string|max:180',
            'packaging_material_name' => 'sometimes|string|max:150',
            'packaging_material_quantity' => 'sometimes|numeric|min:0',
            'packaging_material_unit' => 'sometimes|string|max:30',
            'materials' => 'sometimes|array|min:1',
            'materials.*.raw_material_id' => 'required_with:materials|exists:raw_materials,id',
            'materials.*.quantity_per_pack' => 'required_with:materials|numeric|min:0.0001',
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

        $targetStatus = (string) ($request->status ?? $batch->status ?? 'planned');
        if (in_array($targetStatus, ['packed', 'dispatched'], true)) {
            $requestedPackedQty = $request->has('packed_quantity')
                ? round((float) $request->packed_quantity, 3)
                : round((float) ($batch->packed_quantity ?? 0), 3);
            $requestedPackSizeQty = $request->has('packaging_material_quantity')
                ? round((float) $request->packaging_material_quantity, 3)
                : round((float) ($batch->packaging_material_quantity ?? 1), 3);
            if ($requestedPackSizeQty <= 0) {
                $requestedPackSizeQty = 1;
            }
            $requestedConsumedQty = round($requestedPackedQty * $requestedPackSizeQty, 3);

            $inspection = QcInspection::find($batch->qc_inspection_id);
            if ($inspection) {
                $packedByOthers = (float) PackagingBatch::where('qc_inspection_id', $batch->qc_inspection_id)
                    ->where('id', '!=', $batch->id)
                    ->whereIn('status', ['packed', 'dispatched'])
                    ->selectRaw('COALESCE(SUM(packed_quantity * COALESCE(NULLIF(packaging_material_quantity, 0), 1)), 0) as consumed_qty')
                    ->value('consumed_qty');

                $availableBalance = round(max(0, (float) ($inspection->approved_quantity ?? 0) - $packedByOthers), 3);
                if ($requestedConsumedQty > $availableBalance) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Packed quantity exceeds available approved balance for this QC batch.',
                        'errors' => [
                            'packed_quantity' => ["Available balance is {$availableBalance} after applying pack size quantity."],
                        ],
                    ], 422);
                }
            }
        }

        DB::transaction(function () use ($request, $batch) {
            $batch->loadMissing('materials');

            $payload = $request->only([
                'final_product_name',
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

            $materialPayload = null;
            $rawMaterials = collect();
            if ($request->has('materials')) {
                $materialPayload = collect($request->materials)
                    ->map(function ($line) {
                        return [
                            'raw_material_id' => (int) ($line['raw_material_id'] ?? 0),
                            'quantity_per_pack' => (float) ($line['quantity_per_pack'] ?? 0),
                        ];
                    })
                    ->filter(fn ($line) => $line['raw_material_id'] > 0 && $line['quantity_per_pack'] > 0)
                    ->values();

                if ($materialPayload->isEmpty()) {
                    throw ValidationException::withMessages([
                        'materials' => ['Add at least one packaging raw material line.'],
                    ]);
                }

                if ($materialPayload->pluck('raw_material_id')->unique()->count() !== $materialPayload->count()) {
                    throw ValidationException::withMessages([
                        'materials' => ['Duplicate raw materials are not allowed in one packaging batch.'],
                    ]);
                }

                $rawMaterials = RawMaterial::with('inventoryItem')
                    ->whereIn('id', $materialPayload->pluck('raw_material_id')->all())
                    ->get()
                    ->keyBy('id');

                $this->syncBatchPackagingMaterials($batch, 0);
                $batch->materials()->delete();

                $materialsToSave = $materialPayload->map(function ($line) use ($rawMaterials) {
                    $raw = $rawMaterials->get((int) $line['raw_material_id']);
                    $inv = $raw?->inventoryItem;
                    return [
                        'raw_material_id' => (int) $line['raw_material_id'],
                        'inventory_item_id' => (int) ($raw?->inventory_item_id ?? 0),
                        'material_name' => (string) ($inv?->name ?? ('Material #' . (int) $line['raw_material_id'])),
                        'material_code' => (string) ($inv?->code ?? ''),
                        'material_unit' => (string) ($inv?->unit ?? ''),
                        'quantity_per_pack' => (float) $line['quantity_per_pack'],
                        'consumed_quantity' => 0,
                    ];
                })->all();

                $batch->materials()->createMany($materialsToSave);

                $summary = $this->buildMaterialSummary($materialPayload->all(), $rawMaterials);
                if (!$request->filled('packaging_material_name')) {
                    $payload['packaging_material_name'] = $summary['name'];
                }
                if (!$request->filled('packaging_material_quantity')) {
                    $payload['packaging_material_quantity'] = $summary['qty'];
                }
                if (!$request->filled('packaging_material_unit')) {
                    $payload['packaging_material_unit'] = $summary['unit'];
                }
            }

            if ($request->filled('status') && in_array($request->status, ['packed', 'dispatched'], true)) {
                $payload['packed_at'] = now();
            }

            $previousSyncedQty = (float) ($batch->main_store_synced_quantity ?? 0);
            $batch->update($payload);
            $batch->refresh();

            if (in_array($batch->status, ['packed', 'dispatched'], true)) {
                $this->syncBatchToMainStore($batch, $previousSyncedQty);
            }

            $targetPackQty = in_array($batch->status, ['packed', 'dispatched'], true)
                ? (float) ($batch->packed_quantity ?? 0)
                : 0;
            $this->syncBatchPackagingMaterials($batch, $targetPackQty);
        });

        return response()->json([
            'success' => true,
            'data' => $batch->fresh([
                'qcInspection:id,production_order_id,inspection_date,quality_status,approved_quantity',
                'productionOrder:id,product_id,batch_no,status,started_at,completed_at',
                'productionOrder.product:id,name,code,unit',
                'productionOrder.plan:id,order_number,plan_date,shift',
                'materials:id,packaging_batch_id,raw_material_id,inventory_item_id,material_name,material_code,material_unit,quantity_per_pack,consumed_quantity',
            ]),
            'message' => 'Packaging batch updated successfully',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $batch = PackagingBatch::with([
            'materials',
            'productionOrder.product',
        ])->find($id);

        if (!$batch) {
            return response()->json([
                'success' => false,
                'message' => 'Packaging batch not found',
            ], 404);
        }

        DB::transaction(function () use ($batch) {
            // Return consumed packaging materials before deleting the lines.
            $this->syncBatchPackagingMaterials($batch, 0);

            // Reverse finished-good stock synced to main store for this batch.
            $this->rollbackBatchMainStoreSync($batch);

            $batch->materials()->delete();
            $batch->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Packaging batch removed and stock rollback completed successfully',
        ]);
    }

    private function buildMaterialSummary(array $materialPayload, $rawMaterials): array
    {
        if (count($materialPayload) === 0) {
            return [
                'name' => null,
                'qty' => null,
                'unit' => null,
            ];
        }

        if (count($materialPayload) === 1) {
            $line = $materialPayload[0];
            $raw = $rawMaterials->get((int) ($line['raw_material_id'] ?? 0));
            $inv = $raw?->inventoryItem;
            return [
                'name' => $inv?->name,
                'qty' => (float) ($line['quantity_per_pack'] ?? 0),
                'unit' => $inv?->unit,
            ];
        }

        return [
            'name' => 'Multiple Packaging Materials',
            'qty' => 1,
            'unit' => 'set',
        ];
    }

    private function syncBatchPackagingMaterials(PackagingBatch $batch, float $targetPackedQuantity): void
    {
        $batch->loadMissing('materials');

        if ($batch->materials->isEmpty()) {
            return;
        }

        foreach ($batch->materials as $line) {
            $perPack = (float) ($line->quantity_per_pack ?? 0);
            $targetConsumed = round(max(0, $targetPackedQuantity) * max(0, $perPack), 4);
            $currentConsumed = (float) ($line->consumed_quantity ?? 0);
            $delta = round($targetConsumed - $currentConsumed, 4);

            if (abs($delta) < 0.0001) {
                continue;
            }

            $inventory = InventoryItem::where('id', $line->inventory_item_id)
                ->lockForUpdate()
                ->first();

            if (!$inventory) {
                throw ValidationException::withMessages([
                    'materials' => ["Linked inventory item not found for {$line->material_name}."],
                ]);
            }

            $stock = (float) ($inventory->current_stock ?? 0);
            if ($delta > 0 && $stock < $delta) {
                throw ValidationException::withMessages([
                    'materials' => [
                        "Insufficient packaging material stock for {$line->material_name}. Required {$delta} {$line->material_unit}, available {$stock} {$line->material_unit}."
                    ],
                ]);
            }

            $inventory->current_stock = round($stock - $delta, 3);
            $inventory->save();

            $line->consumed_quantity = $targetConsumed;
            $line->save();
        }
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

        $variantMeta = $this->buildVariantMeta($product, $batch);

        $item = InventoryItem::where('type', 'finished_good')
            ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.production_product_id')) = ?", [(string) $product->id])
            ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.packaging_variant_key')) = ?", [$variantMeta['variant_key']])
            ->first();

        if (!$item) {
            $item = InventoryItem::where('type', 'finished_good')
                ->where('code', $variantMeta['inventory_code'])
                ->first();
        }

        if (!$item) {
            $inventoryCode = $variantMeta['inventory_code'];
            if (InventoryItem::where('code', $inventoryCode)->exists()) {
                $inventoryCode = 'FG-' . $variantMeta['inventory_code'];
                $suffix = 1;
                while (InventoryItem::where('code', $inventoryCode)->exists()) {
                    $inventoryCode = 'FG-' . $variantMeta['inventory_code'] . '-' . $suffix;
                    $suffix++;
                }
            }

            $item = InventoryItem::create([
                'name' => $variantMeta['inventory_name'],
                'code' => $inventoryCode,
                'description' => 'Finished good variant generated from production packaging flow.',
                'type' => 'finished_good',
                'category' => 'Main Store',
                'unit' => $variantMeta['inventory_unit'],
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
        $info['production_product_code'] = $product->code;
        $info['production_product_name'] = $product->name;
        $info['packaging_variant_key'] = $variantMeta['variant_key'];
        $info['packaging_variant_name'] = $variantMeta['inventory_name'];
        $info['packaging_variant_qty'] = $variantMeta['variant_qty'];
        $info['packaging_variant_unit'] = $variantMeta['variant_unit'];
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

    private function rollbackBatchMainStoreSync(PackagingBatch $batch): void
    {
        $syncedQty = round((float) ($batch->main_store_synced_quantity ?? 0), 3);
        if ($syncedQty <= 0) {
            return;
        }

        $batch->loadMissing('productionOrder.product');
        $product = $batch->productionOrder?->product;
        if (!$product) {
            return;
        }

        $variantMeta = $this->buildVariantMeta($product, $batch);

        $item = InventoryItem::where('type', 'finished_good')
            ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.production_product_id')) = ?", [(string) $product->id])
            ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(additional_info, '$.packaging_variant_key')) = ?", [$variantMeta['variant_key']])
            ->first();

        if (!$item) {
            $item = InventoryItem::where('type', 'finished_good')
                ->where('code', $variantMeta['inventory_code'])
                ->first();
        }

        if (!$item) {
            return;
        }

        $currentStock = (float) ($item->current_stock ?? 0);
        $item->current_stock = round(max(0, $currentStock - $syncedQty), 3);

        $info = $item->additional_info ?? [];
        $info['last_unsynced_batch_id'] = $batch->id;
        $info['last_unsynced_at'] = Carbon::now()->toDateTimeString();
        $item->additional_info = $info;
        $item->save();
    }

    private function buildVariantMeta($product, PackagingBatch $batch): array
    {
        $variantName = trim((string) ($batch->final_product_name ?: ''));
        if ($variantName === '') {
            $variantName = trim((string) $product->name);
        }

        $variantKey = strtoupper(trim((string) $product->code)) . '|' . strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $variantName));

        $codeBase = strtoupper(trim((string) $product->code));
        $nameToken = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $variantName));
        if ($nameToken === '') {
            $nameToken = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $batch->label_code));
        }
        if ($nameToken === '') {
            $nameToken = 'PACK';
        }

        $qty = (float) ($batch->packaging_material_quantity ?? 0);
        $unit = trim((string) ($batch->packaging_material_unit ?: 'pcs'));

        return [
            'inventory_name' => $variantName,
            'inventory_code' => $codeBase . '-PK-' . $nameToken,
            'inventory_unit' => $unit ?: ($product->unit ?: 'pcs'),
            'variant_key' => $variantKey,
            'variant_qty' => $qty,
            'variant_unit' => $unit,
        ];
    }
}
