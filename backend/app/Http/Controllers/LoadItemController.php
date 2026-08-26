<?php

namespace App\Http\Controllers;

use App\Models\LoadItem;
use App\Models\Load;
use App\Models\InventoryItem;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class LoadItemController extends Controller
{
    /**
     * Display a listing of load items for a specific load.
     */
    public function index(Request $request): JsonResponse
    {
        $loadId = $request->query('load_id');
        if (!$loadId) {
            return response()->json(['message' => 'Load ID is required'], 400);
        }

        $loadItems = LoadItem::where('load_id', $loadId)->get();
        return response()->json($loadItems);
    }

    /**
     * Store a new load item.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'load_id' => 'required|exists:loads,id',
            'product_code' => 'required|string|max:255',
            'name' => 'required|string|max:255',
            'type' => 'required|in:finished_product,raw_material',
            'out_price' => 'required|numeric|min:0',
            'sell_price' => 'required|numeric|min:0',
            'qty' => 'required|numeric|min:0.01'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        DB::beginTransaction();
        try {
            // Check inventory availability
            $inventoryItem = InventoryItem::where('code', $request->product_code)->first();
            if (!$inventoryItem || $inventoryItem->current_stock < $request->qty) {
                return response()->json([
                    'message' => 'Insufficient inventory for product: ' . $request->product_code
                ], 400);
            }

            // Create load item
            $loadItem = LoadItem::create(array_merge($request->all(), [
                'loaded_qty' => $request->qty,
            ]));

            // Deduct from inventory
            $inventoryItem->decrement('current_stock', $request->qty);

            DB::commit();

            return response()->json([
                'message' => 'Load item added successfully',
                'load_item' => $loadItem
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to add load item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified load item.
     */
    public function show(LoadItem $loadItem): JsonResponse
    {
        return response()->json($loadItem);
    }

    /**
     * Update the specified load item.
     */
    public function update(Request $request, LoadItem $loadItem): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'product_code' => 'required|string|max:255',
            'name' => 'required|string|max:255',
            'type' => 'required|in:finished_product,raw_material',
            'out_price' => 'required|numeric|min:0',
            'sell_price' => 'required|numeric|min:0',
            'qty' => 'required|numeric|min:0.01'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        DB::beginTransaction();
        try {
            $oldQty = $loadItem->qty;
            $newQty = $request->qty;

            // Check inventory availability for quantity increase
            if ($newQty > $oldQty) {
                $additionalQty = $newQty - $oldQty;
                $inventoryItem = InventoryItem::where('code', $request->product_code)->first();
                if (!$inventoryItem || $inventoryItem->current_stock < $additionalQty) {
                    return response()->json([
                        'message' => 'Insufficient inventory for product: ' . $request->product_code
                    ], 400);
                }
                $inventoryItem->decrement('current_stock', $additionalQty);
            } elseif ($newQty < $oldQty) {
                // Return quantity back to inventory
                $returnQty = $oldQty - $newQty;
                $inventoryItem = InventoryItem::where('code', $request->product_code)->first();
                if ($inventoryItem) {
                    $inventoryItem->increment('current_stock', $returnQty);
                }
            }

            $loadItem->update(array_merge($request->all(), [
                'loaded_qty' => max(0, (float) $loadItem->loaded_qty + ((float) $newQty - (float) $oldQty)),
            ]));

            DB::commit();

            return response()->json([
                'message' => 'Load item updated successfully',
                'load_item' => $loadItem
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to update load item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified load item.
     */
    public function destroy(LoadItem $loadItem): JsonResponse
    {
        DB::beginTransaction();
        try {
            // Return quantity back to inventory
            $inventoryItem = InventoryItem::where('code', $loadItem->product_code)->first();
            if ($inventoryItem) {
                $inventoryItem->increment('current_stock', $loadItem->qty);
            }

            $loadItem->delete();

            DB::commit();

            return response()->json([
                'message' => 'Load item removed successfully'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to remove load item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Upload CSV file to bulk import load items.
     */
    public function uploadCsv(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'load_id' => 'required|exists:loads,id',
            'csv_file' => 'required|file|mimes:csv,txt|max:2048'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $file = $request->file('csv_file');
        $loadId = $request->load_id;

        DB::beginTransaction();
        try {
            $handle = fopen($file->getPathname(), 'r');
            $header = fgetcsv($handle); // Skip header row

            $imported = 0;
            $errors = [];

            while (($row = fgetcsv($handle)) !== false) {
                try {
                    $data = [
                        'load_id' => $loadId,
                        'product_code' => $row[0] ?? '',
                        'name' => $row[1] ?? '',
                        'type' => $row[2] ?? '',
                        'out_price' => $row[3] ?? 0,
                        'sell_price' => $row[4] ?? 0,
                        'qty' => $row[5] ?? 0,
                        'loaded_qty' => $row[5] ?? 0
                    ];

                    // Validate row data
                    $rowValidator = Validator::make($data, [
                        'product_code' => 'required|string|max:255',
                        'name' => 'required|string|max:255',
                        'type' => 'required|in:finished_product,raw_material',
                        'out_price' => 'required|numeric|min:0',
                        'sell_price' => 'required|numeric|min:0',
                        'qty' => 'required|numeric|min:0.01'
                    ]);

                    if ($rowValidator->fails()) {
                        $errors[] = 'Row ' . ($imported + 2) . ': ' . implode(', ', $rowValidator->errors()->all());
                        continue;
                    }

                    // Check inventory
                    $inventoryItem = InventoryItem::where('product_code', $data['product_code'])->first();
                    if (!$inventoryItem || $inventoryItem->quantity < $data['qty']) {
                        $errors[] = 'Row ' . ($imported + 2) . ': Insufficient inventory for ' . $data['product_code'];
                        continue;
                    }

                    // Create load item
                    LoadItem::create($data);

                    // Deduct from inventory
                    $inventoryItem->decrement('quantity', $data['qty']);

                    $imported++;

                } catch (\Exception $e) {
                    $errors[] = 'Row ' . ($imported + 2) . ': ' . $e->getMessage();
                }
            }

            fclose($handle);

            if ($imported > 0) {
                DB::commit();
                return response()->json([
                    'message' => "CSV uploaded successfully. Imported {$imported} items.",
                    'imported' => $imported,
                    'errors' => $errors
                ]);
            } else {
                DB::rollBack();
                return response()->json([
                    'message' => 'No items were imported',
                    'errors' => $errors
                ], 400);
            }

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to process CSV file',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
