<?php

namespace App\Http\Controllers\Production;

use App\Http\Controllers\Controller;
use App\Models\BomHeader;
use App\Models\GrnItem;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\ProductionOrder;
use App\Models\RawMaterial;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BomController extends Controller
{
    private function resolveProductDeleteBlockReason(Product $product): ?string
    {
        $hasProductionOrders = ProductionOrder::where('product_id', $product->id)->exists();
        if ($hasProductionOrders) {
            return 'Production orders already exist for this product.';
        }

        return null;
    }

    public function products(): JsonResponse
    {
        $products = Product::orderBy('name')->get()->map(function (Product $product) {
            $blockReason = $this->resolveProductDeleteBlockReason($product);

            return [
                'id' => $product->id,
                'name' => $product->name,
                'code' => $product->code,
                'unit' => $product->unit,
                'standard_batch_size' => $product->standard_batch_size,
                'status' => $product->status,
                'can_delete' => $blockReason === null,
                'delete_block_reason' => $blockReason,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data' => $products,
            'message' => 'Products retrieved successfully',
        ]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:products,code',
            'unit' => 'required|string|max:30',
            'standard_batch_size' => 'required|numeric|min:0.001',
            'description' => 'nullable|string',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $product = Product::create([
            'name' => $request->name,
            'code' => $request->code,
            'unit' => $request->unit,
            'standard_batch_size' => $request->standard_batch_size,
            'description' => $request->description,
            'status' => $request->status ?? 'active',
        ]);

        return response()->json([
            'success' => true,
            'data' => $product,
            'message' => 'Product created successfully',
        ], 201);
    }

    public function destroyProduct(Product $product): JsonResponse
    {
        $blockReason = $this->resolveProductDeleteBlockReason($product);
        if ($blockReason !== null) {
            return response()->json([
                'success' => false,
                'message' => "Cannot remove this base product because {$blockReason}",
            ], 422);
        }

        try {
            DB::transaction(function () use ($product) {
                DB::table('production_plans')
                    ->where('product_id', $product->id)
                    ->delete();

                BomHeader::where('product_id', $product->id)->delete();

                $product->delete();
            });
        } catch (QueryException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove this base product because it is linked to other records.',
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Base product removed successfully.',
        ]);
    }

    public function rawMaterials(): JsonResponse
    {
        $grnBatchItems = GrnItem::with('purchaseOrderItem.inventoryItem')
            ->where('accepted_quantity', '>', 0)
            ->whereHas('purchaseOrderItem.inventoryItem', fn ($q) => $q->where('type', 'raw_material'))
            ->get();

        foreach ($grnBatchItems as $grnItem) {
            $inventoryItemId = (int) ($grnItem->purchaseOrderItem?->inventory_item_id ?? 0);
            if ($inventoryItemId <= 0) {
                continue;
            }

            RawMaterial::firstOrCreate(
                [
                    'inventory_item_id' => $inventoryItemId,
                    'grn_item_id' => (int) $grnItem->id,
                ],
                [
                    'status' => 'active',
                ]
            );
        }

        $materials = RawMaterial::with([
            'inventoryItem',
            'grnItem.grn',
            'grnItem.purchaseOrderItem:id,inventory_item_id,unit_price',
        ])->orderByDesc('id')->get();

        return response()->json([
            'success' => true,
            'data' => $materials,
            'message' => 'Raw materials retrieved successfully',
        ]);
    }

    public function storeRawMaterial(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'inventory_item_id' => [
                'nullable',
                'integer',
                Rule::exists('inventory_items', 'id')->where(fn ($q) => $q->where('type', 'raw_material')),
            ],
            'grn_item_id' => 'nullable|integer|exists:grn_items,id',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        if (empty($request->inventory_item_id) && empty($request->grn_item_id)) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => [
                    'inventory_item_id' => ['Select either an inventory item or a GRN batch item.'],
                ],
            ], 422);
        }

        $resolvedInventoryItemId = (int) ($request->inventory_item_id ?? 0);
        $resolvedGrnItemId = $request->grn_item_id ? (int) $request->grn_item_id : null;

        if ($resolvedGrnItemId) {
            $grnItem = GrnItem::with('purchaseOrderItem.inventoryItem')->find($resolvedGrnItemId);
            $resolvedInventoryItemId = (int) ($grnItem?->purchaseOrderItem?->inventory_item_id ?? 0);

            $isRawMaterial = (string) ($grnItem?->purchaseOrderItem?->inventoryItem?->type ?? '') === 'raw_material';
            if ($resolvedInventoryItemId <= 0 || !$isRawMaterial) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => [
                        'grn_item_id' => ['Selected GRN item is not linked to a raw material inventory record.'],
                    ],
                ], 422);
            }
        }

        $existing = RawMaterial::query()
            ->when($resolvedGrnItemId, fn ($q) => $q->where('grn_item_id', $resolvedGrnItemId))
            ->when(!$resolvedGrnItemId, fn ($q) => $q->where('inventory_item_id', $resolvedInventoryItemId)->whereNull('grn_item_id'))
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => $resolvedGrnItemId
                    ? 'Selected raw material batch is already added.'
                    : 'Selected inventory item is already added as a raw material.',
            ], 422);
        }

        $material = RawMaterial::create([
            'inventory_item_id' => $resolvedInventoryItemId,
            'grn_item_id' => $resolvedGrnItemId,
            'status' => $request->status ?? 'active',
        ])->load([
            'inventoryItem',
            'grnItem.grn',
            'grnItem.purchaseOrderItem:id,inventory_item_id,unit_price',
        ]);

        return response()->json([
            'success' => true,
            'data' => $material,
            'message' => 'Raw material added successfully',
        ], 201);
    }

    public function destroyRawMaterial(RawMaterial $rawMaterial): JsonResponse
    {
        $isUsedInBom = DB::table('bom_items')
            ->where('material_id', $rawMaterial->id)
            ->exists();

        if ($isUsedInBom) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove this raw material because it is already used in BOM recipes.',
            ], 422);
        }

        $rawMaterial->delete();

        return response()->json([
            'success' => true,
            'message' => 'Raw material removed successfully',
        ]);
    }

    public function boms(): JsonResponse
    {
        $boms = BomHeader::with([
            'product',
            'items.material.inventoryItem',
        ])->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $boms,
            'message' => 'BOM records retrieved successfully',
        ]);
    }

    public function storeBom(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'product_id' => 'required|exists:products,id',
            'version' => 'required|string|max:30',
            'batch_size' => 'required|numeric|min:0.001',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.material_id' => 'required|exists:raw_materials,id',
            'items.*.quantity' => 'required|numeric|min:0.0001',
            'items.*.unit' => 'nullable|string|max:30',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $duplicate = BomHeader::where('product_id', $request->product_id)
            ->where('version', $request->version)
            ->exists();

        if ($duplicate) {
            return response()->json([
                'success' => false,
                'message' => 'This product already has BOM with the same version.',
            ], 422);
        }

        $materialIds = collect($request->items)->pluck('material_id');
        if ($materialIds->count() !== $materialIds->unique()->count()) {
            return response()->json([
                'success' => false,
                'message' => 'Duplicate materials are not allowed in a single BOM.',
            ], 422);
        }

        $bom = DB::transaction(function () use ($request) {
            $bomHeader = BomHeader::create([
                'product_id' => $request->product_id,
                'version' => $request->version,
                'batch_size' => $request->batch_size,
                'notes' => $request->notes,
                'is_active' => true,
            ]);

            $materials = RawMaterial::with('inventoryItem')
                ->whereIn('id', collect($request->items)->pluck('material_id'))
                ->get()
                ->keyBy('id');

            foreach ($request->items as $line) {
                $material = $materials->get((int) $line['material_id']);
                $bomHeader->items()->create([
                    'material_id' => $line['material_id'],
                    'quantity' => $line['quantity'],
                    'unit' => $line['unit'] ?: ($material?->inventoryItem?->unit ?: 'unit'),
                ]);
            }

            return $bomHeader->load(['product', 'items.material.inventoryItem']);
        });

        return response()->json([
            'success' => true,
            'data' => $bom,
            'message' => 'BOM recipe created successfully',
        ], 201);
    }

    public function showBom(int $bomId): JsonResponse
    {
        $bom = BomHeader::with(['product', 'items.material.inventoryItem'])->find($bomId);
        if (!$bom) {
            return response()->json([
                'success' => false,
                'message' => 'BOM not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $bom,
            'message' => 'BOM retrieved successfully',
        ]);
    }

    public function calculateMaterials(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'bom_id' => 'required|exists:bom_headers,id',
            'production_quantity' => 'required|numeric|min:0.001',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $bom = BomHeader::with(['product', 'items.material.inventoryItem'])->findOrFail((int) $request->bom_id);
        if ((float) $bom->batch_size <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'BOM batch size must be greater than zero.',
            ], 422);
        }

        $multiplier = (float) $request->production_quantity / (float) $bom->batch_size;
        $requirements = $bom->items->map(function ($item) use ($multiplier) {
            $required = round(((float) $item->quantity * $multiplier), 4);
            $stock = (float) ($item->material?->inventoryItem?->current_stock ?? 0);

            return [
                'material_id' => $item->material_id,
                'material_name' => $item->material?->inventoryItem?->name,
                'material_code' => $item->material?->inventoryItem?->code,
                'inventory_item_id' => $item->material?->inventory_item_id,
                'unit' => $item->unit,
                'required_quantity' => $required,
                'available_stock' => $stock,
                'shortage' => round(max(0, $required - $stock), 4),
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'bom_id' => $bom->id,
                'product' => $bom->product,
                'batch_size' => (float) $bom->batch_size,
                'production_quantity' => (float) $request->production_quantity,
                'multiplier' => round($multiplier, 4),
                'requirements' => $requirements,
            ],
            'message' => 'Material requirements calculated successfully',
        ]);
    }

    public function startProduction(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'bom_id' => 'required|exists:bom_headers,id',
            'production_quantity' => 'required|numeric|min:0.001',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $bom = BomHeader::with(['product', 'items.material.inventoryItem'])->findOrFail((int) $request->bom_id);
        if ((float) $bom->batch_size <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'BOM batch size must be greater than zero.',
            ], 422);
        }

        $productionQuantity = (float) $request->production_quantity;
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

        try {
            $order = DB::transaction(function () use ($bom, $request, $productionQuantity, $multiplier, $baseRequirements) {
                $inventoryIds = collect($baseRequirements)->pluck('inventory_item_id')->unique()->values();
                $stockMap = InventoryItem::whereIn('id', $inventoryIds)->lockForUpdate()->get()->keyBy('id');

                $requirements = collect($baseRequirements)->map(function ($row) use ($stockMap) {
                    $stockItem = $stockMap->get((int) $row['inventory_item_id']);
                    $available = (float) ($stockItem?->current_stock ?? 0);

                    if (!$stockItem || $available < (float) $row['required_quantity']) {
                        throw ValidationException::withMessages([
                            'production_quantity' => [
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

                return ProductionOrder::create([
                    'product_id' => $bom->product_id,
                    'bom_id' => $bom->id,
                    'production_quantity' => $productionQuantity,
                    'batch_size' => (float) $bom->batch_size,
                    'multiplier' => round($multiplier, 4),
                    'status' => 'started',
                    'material_requirements' => $requirements,
                    'started_at' => now(),
                    'notes' => $request->notes,
                ]);
            });

            return response()->json([
                'success' => true,
                'data' => $order->load(['product', 'bom']),
                'message' => 'Production started and raw materials deducted successfully',
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot start production due to insufficient materials',
                'errors' => $e->errors(),
            ], 422);
        }
    }
}
