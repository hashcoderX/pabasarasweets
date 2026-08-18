<?php

namespace App\Http\Controllers;

use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use App\Models\GrnItem;
use App\Models\Product;
use App\Models\RawMaterial;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Pagination\LengthAwarePaginator;

class InventoryController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $batchView = $request->boolean('batch_view', false);

        if ($batchView && $request->input('type') === 'raw_material') {
            return $this->indexRawMaterialsByBatch($request);
        }

        $query = InventoryItem::with('supplier');

        // Filter by type (raw_material or finished_good)
        if ($request->has('type') && !empty($request->type)) {
            $query->where('type', $request->type);
        }

        // Search functionality
        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('category', 'like', "%{$search}%");
            });
        }

        // Status filter
        if ($request->has('status') && !empty($request->status)) {
            $query->where('status', $request->status);
        }

        // Low stock filter
        if ($request->has('low_stock') && $request->low_stock == 'true') {
            $query->whereRaw('current_stock <= minimum_stock');
        }

        // Out of stock filter
        if ($request->has('out_of_stock') && $request->out_of_stock == 'true') {
            $query->where('current_stock', '<=', 0);
        }

        // Pagination
        $perPage = $request->get('per_page', 15);
        $items = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $items,
            'message' => 'Inventory items retrieved successfully'
        ]);
    }

    private function indexRawMaterialsByBatch(Request $request): JsonResponse
    {
        $query = InventoryItem::with('supplier')->where('type', 'raw_material');

        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }

        if ($request->has('status') && !empty($request->status)) {
            $query->where('status', $request->status);
        }

        if ($request->has('low_stock') && $request->low_stock == 'true') {
            $query->whereRaw('current_stock <= minimum_stock');
        }

        if ($request->has('out_of_stock') && $request->out_of_stock == 'true') {
            $query->where('current_stock', '<=', 0);
        }

        $inventoryItems = $query->orderBy('created_at', 'desc')->get();
        $inventoryItemIds = $inventoryItems->pluck('id')->all();

        $grnItems = GrnItem::with([
            'grn.purchaseOrder.supplier',
            'purchaseOrderItem:id,inventory_item_id,unit_price',
        ])
            ->whereHas('purchaseOrderItem', function ($q) use ($inventoryItemIds) {
                $q->whereIn('inventory_item_id', $inventoryItemIds);
            })
            ->orderBy('id', 'desc')
            ->get();

        $grnItemsByInventory = $grnItems->groupBy(function (GrnItem $grnItem) {
            return $grnItem->purchaseOrderItem?->inventory_item_id;
        });

        $rows = collect();

        foreach ($inventoryItems as $inventoryItem) {
            $itemGrnRows = $grnItemsByInventory->get($inventoryItem->id, collect());

            if ($itemGrnRows->isEmpty()) {
                $base = json_decode(json_encode($inventoryItem), true) ?: [];
                $base['inventory_item_id'] = $inventoryItem->id;
                $base['grn_item_id'] = null;
                $base['batch_no'] = 'OPENING';
                $base['batch_purchase_price'] = $inventoryItem->purchase_price ?? $inventoryItem->unit_price;
                $base['batch_received_quantity'] = null;
                $base['batch_accepted_quantity'] = null;
                $base['batch_rejected_quantity'] = null;
                $base['batch_received_date'] = null;
                $base['batch_quality_status'] = null;
                $base['unit_price'] = $inventoryItem->purchase_price ?? $inventoryItem->unit_price;
                $base['purchase_price'] = $inventoryItem->purchase_price ?? $inventoryItem->unit_price;
                $rows->push($base);
                continue;
            }

            foreach ($itemGrnRows as $grnItem) {
                $purchaseOrderItem = $grnItem->purchaseOrderItem;
                $grn = $grnItem->grn;
                $supplier = $grn?->purchaseOrder?->supplier;
                $resolvedPurchasePrice = $grnItem->purchase_price
                    ?? $purchaseOrderItem?->unit_price
                    ?? $inventoryItem->purchase_price
                    ?? $inventoryItem->unit_price;

                $row = json_decode(json_encode($inventoryItem), true) ?: [];
                $row['id'] = $grnItem->id;
                $row['inventory_item_id'] = $inventoryItem->id;
                $row['grn_item_id'] = $grnItem->id;
                $row['batch_no'] = ($grn?->grn_number ?: 'GRN') . '-I' . $grnItem->id;
                $row['batch_purchase_price'] = $resolvedPurchasePrice;
                $row['batch_received_quantity'] = $grnItem->received_quantity;
                $row['batch_accepted_quantity'] = $grnItem->accepted_quantity;
                $row['batch_rejected_quantity'] = $grnItem->rejected_quantity;
                $row['batch_received_date'] = $grn?->received_date;
                $row['batch_quality_status'] = $grnItem->quality_status;
                $row['expiry_date'] = $grnItem->expiry_date ?: $inventoryItem->expiry_date;
                $row['unit_price'] = $resolvedPurchasePrice;
                $row['purchase_price'] = $resolvedPurchasePrice;
                $row['sell_price'] = $grnItem->sell_price ?? $inventoryItem->sell_price;
                $row['supplier_name'] = $supplier?->name ?: ($inventoryItem->supplier_name ?? null);
                $row['supplier_id'] = $supplier?->id ?: ($inventoryItem->supplier_id ?? null);
                $rows->push($row);
            }
        }

        $perPage = (int) $request->get('per_page', 15);
        $page = max((int) $request->get('page', 1), 1);
        $total = $rows->count();
        $currentPageRows = $rows->forPage($page, $perPage)->values();

        $paginated = new LengthAwarePaginator(
            $currentPageRows,
            $total,
            $perPage,
            $page,
            [
                'path' => $request->url(),
                'query' => $request->query(),
            ]
        );

        return response()->json([
            'success' => true,
            'data' => $paginated,
            'message' => 'Raw material batches retrieved successfully'
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:inventory_items,code',
            'description' => 'nullable|string',
            'type' => 'required|in:raw_material,finished_good',
            'category' => 'nullable|string|max:100',
            'unit' => 'required|string|max:50',
            'current_stock' => 'required|numeric|min:0',
            'minimum_stock' => 'required|numeric|min:0',
            'maximum_stock' => 'nullable|numeric|min:0',
            'unit_price' => 'required|numeric|min:0',
            'sell_price' => 'nullable|numeric|min:0',
            'supplier_name' => 'nullable|string|max:255',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'location' => 'nullable|string|max:255',
            'expiry_date' => 'nullable|date|after:today',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $item = InventoryItem::create([
                'name' => $request->name,
                'code' => $request->code,
                'description' => $request->description,
                'type' => $request->type,
                'category' => $request->category,
                'unit' => $request->unit,
                'current_stock' => $request->current_stock,
                'minimum_stock' => $request->minimum_stock,
                'maximum_stock' => $request->maximum_stock,
                'unit_price' => $request->unit_price,
                'sell_price' => $request->sell_price,
                'supplier_name' => $request->supplier_name,
                'supplier_id' => $request->supplier_id,
                'location' => $request->location,
                'expiry_date' => $request->expiry_date,
                'status' => $request->status ?? 'active',
                'additional_info' => $request->additional_info,
            ]);

            $this->syncProductionReferences($item);
            $this->syncInventoryCategory($item->category, $item->type);

            return response()->json([
                'success' => true,
                'data' => $item->load('supplier'),
                'message' => 'Inventory item created successfully'
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create inventory item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        try {
            $item = InventoryItem::with('supplier')->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => $item,
                'message' => 'Inventory item retrieved successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item not found'
            ], 404);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:inventory_items,code,' . $id,
            'description' => 'nullable|string',
            'type' => 'required|in:raw_material,finished_good',
            'category' => 'nullable|string|max:100',
            'unit' => 'required|string|max:50',
            'current_stock' => 'required|numeric|min:0',
            'minimum_stock' => 'required|numeric|min:0',
            'maximum_stock' => 'nullable|numeric|min:0',
            'unit_price' => 'required|numeric|min:0',
            'sell_price' => 'nullable|numeric|min:0',
            'supplier_name' => 'nullable|string|max:255',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'location' => 'nullable|string|max:255',
            'expiry_date' => 'nullable|date',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $item = InventoryItem::findOrFail($id);
            $originalCode = $item->code;

            $item->update([
                'name' => $request->name,
                'code' => $request->code,
                'description' => $request->description,
                'type' => $request->type,
                'category' => $request->category,
                'unit' => $request->unit,
                'current_stock' => $request->current_stock,
                'minimum_stock' => $request->minimum_stock,
                'maximum_stock' => $request->maximum_stock,
                'unit_price' => $request->unit_price,
                'sell_price' => $request->sell_price,
                'supplier_name' => $request->supplier_name,
                'supplier_id' => $request->supplier_id,
                'location' => $request->location,
                'expiry_date' => $request->expiry_date,
                'status' => $request->status ?? $item->status,
                'additional_info' => $request->additional_info,
            ]);

            $this->syncProductionReferences($item, $originalCode);
            $this->syncInventoryCategory($item->category, $item->type);

            return response()->json([
                'success' => true,
                'data' => $item->load('supplier'),
                'message' => 'Inventory item updated successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update inventory item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $item = InventoryItem::findOrFail($id);

            RawMaterial::where('inventory_item_id', $item->id)->delete();

            Product::where('code', $item->code)->delete();

            $item->delete();

            return response()->json([
                'success' => true,
                'message' => 'Inventory item deleted successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete inventory item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    private function syncProductionReferences(InventoryItem $item, ?string $originalCode = null): void
    {
        if ($item->type === 'raw_material') {
            RawMaterial::updateOrCreate(
                ['inventory_item_id' => $item->id],
                ['status' => $item->status]
            );

            $productCleanupQuery = Product::where('code', $item->code);
            if ($originalCode) {
                $productCleanupQuery->orWhere('code', $originalCode);
            }
            $productCleanupQuery->delete();

            return;
        }

        RawMaterial::where('inventory_item_id', $item->id)->delete();

        $product = null;

        if ($originalCode) {
            $product = Product::where('code', $originalCode)->first();
        }

        if (!$product) {
            $product = Product::where('code', $item->code)->first();
        }

        if ($product) {
            $product->update([
                'name' => $item->name,
                'code' => $item->code,
                'unit' => $item->unit ?: 'pcs',
                'description' => $item->description,
                'status' => $item->status ?? 'active',
            ]);

            return;
        }

        Product::create([
            'name' => $item->name,
            'code' => $item->code,
            'unit' => $item->unit ?: 'pcs',
            'standard_batch_size' => 1,
            'description' => $item->description,
            'status' => $item->status ?? 'active',
        ]);
    }

    private function syncInventoryCategory(?string $categoryName, ?string $type): void
    {
        $normalized = preg_replace('/\s+/', ' ', trim((string) $categoryName));
        if (!$normalized) {
            return;
        }

        $allowedTypes = ['raw_material', 'finished_good', 'office_asset'];
        $resolvedType = in_array((string) $type, $allowedTypes, true) ? (string) $type : 'raw_material';

        InventoryCategory::updateOrCreate(
            ['name' => $normalized, 'type' => $resolvedType],
            ['status' => 'active']
        );
    }
}
