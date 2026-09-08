<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionInvoiceItem;
use App\Models\DistributionPayment;
use App\Models\InventoryItem;
use App\Models\Load;
use App\Models\LoadItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DistributionInvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DistributionInvoice::with(['customer:id,shop_name,customer_code,route_id', 'items']);

        $user = $request->user();

        if ($user) {
            $isAdmin = (!$user->employee_id) || $user->hasRole('Super Admin');

            if (!$isAdmin && $user->employee_id) {
                $loads = Load::with('loadRoutes:load_id,route_id')
                    ->select(['id', 'route_id'])
                    ->where('sales_ref_id', $user->employee_id)
                    ->whereIn('status', ['pending', 'in_transit', 'delivered'])
                    ->get();

                $routeIds = $loads
                    ->flatMap(function ($load) {
                        $baseRouteId = $load->route_id ? [$load->route_id] : [];
                        $extraRouteIds = $load->loadRoutes->pluck('route_id')->all();
                        return array_merge($baseRouteId, $extraRouteIds);
                    })
                    ->filter()
                    ->unique()
                    ->toArray();

                if (!empty($routeIds)) {
                    $query->whereHas('customer', function ($q) use ($routeIds) {
                        $q->whereIn('route_id', $routeIds);
                    });
                } else {
                    // No allocated routes for this sales ref - hide invoices
                    $query->whereRaw('1 = 0');
                }
            }
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('load_id')) {
            $query->where('load_id', (int) $request->load_id);
        }

        $invoices = $query->orderByDesc('invoice_date')->orderByDesc('id')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $invoices,
            'message' => 'Distribution invoices retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'invoice_number' => 'required|string|max:60|unique:distribution_invoices,invoice_number',
            'customer_id' => 'required|exists:distribution_customers,id',
            'load_id' => 'nullable|exists:loads,id',
            'invoice_date' => 'required|date',
            'due_date' => 'nullable|date|after_or_equal:invoice_date',
            'discount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'ref_latitude' => 'nullable|numeric|between:-90,90',
            'ref_longitude' => 'nullable|numeric|between:-180,180',
            'ref_gps_accuracy' => 'nullable|numeric|min:0',
            'ref_gps_captured_at' => 'nullable|date',
            'billing_latitude' => 'nullable|numeric|between:-90,90',
            'billing_longitude' => 'nullable|numeric|between:-180,180',
            'billing_gps_accuracy' => 'nullable|numeric|min:0',
            'billing_gps_captured_at' => 'nullable|date',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'nullable|exists:inventory_items,id',
            'items.*.item_code' => 'required|string|max:80',
            'items.*.item_name' => 'required|string|max:255',
            'items.*.unit' => 'nullable|string|max:30',
            'items.*.quantity' => 'required|numeric|gt:0',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.discount' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        $invoice = DB::transaction(function () use ($payload, $request) {
            $user = $request->user();
            $invoiceHasLoadId = Schema::hasColumn('distribution_invoices', 'load_id');
            $invoiceItemsHasLoadId = Schema::hasColumn('distribution_invoice_items', 'load_id');

            $activeLoad = null;
            if (!empty($payload['load_id'])) {
                $activeLoad = Load::find($payload['load_id']);
            }

            if (!$activeLoad && $user && $user->employee_id) {
                $activeLoad = Load::where('sales_ref_id', $user->employee_id)
                    ->whereIn('status', ['pending', 'in_transit'])
                    ->orderByDesc('load_date')
                    ->orderByDesc('id')
                    ->first();
            }

            $subtotal = 0;
            foreach ($payload['items'] as $item) {
                $subtotal += (float) $item['quantity'] * (float) $item['unit_price'];
            }

            $discount = (float) ($payload['discount'] ?? 0);
            $total = max(0, $subtotal - $discount);

            $invoiceData = [
                'invoice_number' => $payload['invoice_number'],
                'customer_id' => $payload['customer_id'],
                'invoice_date' => $payload['invoice_date'],
                'due_date' => $payload['due_date'] ?? null,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'paid_amount' => 0,
                'status' => 'pending',
                'notes' => $payload['notes'] ?? null,
                'ref_latitude' => $payload['ref_latitude'] ?? null,
                'ref_longitude' => $payload['ref_longitude'] ?? null,
                'ref_gps_accuracy' => $payload['ref_gps_accuracy'] ?? null,
                'ref_gps_captured_at' => $payload['ref_gps_captured_at'] ?? null,
                'billing_latitude' => $payload['billing_latitude'] ?? null,
                'billing_longitude' => $payload['billing_longitude'] ?? null,
                'billing_gps_accuracy' => $payload['billing_gps_accuracy'] ?? null,
                'billing_gps_captured_at' => $payload['billing_gps_captured_at'] ?? null,
                'created_by' => $request->user()?->id,
            ];

            if ($invoiceHasLoadId) {
                $invoiceData['load_id'] = $activeLoad?->id;
            }

            $invoice = DistributionInvoice::create($invoiceData);

            foreach ($payload['items'] as $item) {
                $lineTotal = (float) $item['quantity'] * (float) $item['unit_price'];

                $itemData = [
                    'distribution_invoice_id' => $invoice->id,
                    'inventory_item_id' => $item['inventory_item_id'] ?? null,
                    'item_code' => $item['item_code'],
                    'item_name' => $item['item_name'],
                    'unit' => $item['unit'] ?? null,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'discount' => (float) ($item['discount'] ?? 0),
                    'line_total' => $lineTotal,
                ];

                if ($invoiceItemsHasLoadId) {
                    $itemData['load_id'] = $activeLoad?->id;
                }

                DistributionInvoiceItem::create($itemData);

                $handledByLoad = false;

                if ($activeLoad) {
                    $loadItem = LoadItem::where('load_id', $activeLoad->id)
                        ->where('product_code', $item['item_code'])
                        ->first();

                    if ($loadItem) {
                        $loadItem->qty = max(0, (float) $loadItem->qty - (float) $item['quantity']);
                        $loadItem->save();
                        $handledByLoad = true;
                    }
                }

                if (!$handledByLoad && !empty($item['inventory_item_id'])) {
                    $inventory = InventoryItem::find($item['inventory_item_id']);
                    if ($inventory) {
                        $inventory->current_stock = max(0, (float) $inventory->current_stock - (float) $item['quantity']);
                        $inventory->save();
                    }
                }
            }

            return $invoice->load(['customer:id,shop_name,customer_code', 'items']);
        });

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Distribution invoice created successfully',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $invoice = DistributionInvoice::with(['customer:id,shop_name,customer_code', 'items', 'payments'])->find($id);

        if (!$invoice) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution invoice not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Distribution invoice retrieved successfully',
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $invoice = DistributionInvoice::with('items')->find($id);

        if (!$invoice) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution invoice not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'customer_id' => 'required|exists:distribution_customers,id',
            'invoice_date' => 'required|date',
            'due_date' => 'nullable|date|after_or_equal:invoice_date',
            'discount' => 'nullable|numeric|min:0',
            'status' => 'nullable|in:pending,partial,paid,cancelled',
            'notes' => 'nullable|string',
            'ref_latitude' => 'nullable|numeric|between:-90,90',
            'ref_longitude' => 'nullable|numeric|between:-180,180',
            'ref_gps_accuracy' => 'nullable|numeric|min:0',
            'ref_gps_captured_at' => 'nullable|date',
            'billing_latitude' => 'nullable|numeric|between:-90,90',
            'billing_longitude' => 'nullable|numeric|between:-180,180',
            'billing_gps_accuracy' => 'nullable|numeric|min:0',
            'billing_gps_captured_at' => 'nullable|date',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'nullable|exists:inventory_items,id',
            'items.*.item_code' => 'required|string|max:80',
            'items.*.item_name' => 'required|string|max:255',
            'items.*.unit' => 'nullable|string|max:30',
            'items.*.quantity' => 'required|numeric|gt:0',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.discount' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        $invoice = DB::transaction(function () use ($invoice, $payload) {
            $subtotal = 0;
            foreach ($payload['items'] as $item) {
                $subtotal += (float) $item['quantity'] * (float) $item['unit_price'];
            }

            $discount = (float) ($payload['discount'] ?? 0);
            $total = max(0, $subtotal - $discount);

            $invoice->update([
                'customer_id' => $payload['customer_id'],
                'invoice_date' => $payload['invoice_date'],
                'due_date' => $payload['due_date'] ?? null,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'status' => $payload['status'] ?? $invoice->status,
                'notes' => $payload['notes'] ?? null,
                'ref_latitude' => $payload['ref_latitude'] ?? null,
                'ref_longitude' => $payload['ref_longitude'] ?? null,
                'ref_gps_accuracy' => $payload['ref_gps_accuracy'] ?? null,
                'ref_gps_captured_at' => $payload['ref_gps_captured_at'] ?? null,
                'billing_latitude' => $payload['billing_latitude'] ?? null,
                'billing_longitude' => $payload['billing_longitude'] ?? null,
                'billing_gps_accuracy' => $payload['billing_gps_accuracy'] ?? null,
                'billing_gps_captured_at' => $payload['billing_gps_captured_at'] ?? null,
            ]);

            // Replace invoice items without touching load or inventory stock
            DistributionInvoiceItem::where('distribution_invoice_id', $invoice->id)->delete();

            foreach ($payload['items'] as $item) {
                $lineTotal = (float) $item['quantity'] * (float) $item['unit_price'];

                DistributionInvoiceItem::create([
                    'distribution_invoice_id' => $invoice->id,
                    'inventory_item_id' => $item['inventory_item_id'] ?? null,
                    'item_code' => $item['item_code'],
                    'item_name' => $item['item_name'],
                    'unit' => $item['unit'] ?? null,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'discount' => (float) ($item['discount'] ?? 0),
                    'line_total' => $lineTotal,
                ]);
            }

            return $invoice->load(['customer:id,shop_name,customer_code', 'items']);
        });

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Distribution invoice updated successfully',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $invoice = DistributionInvoice::with(['items', 'payments', 'customer'])->find($id);

        if (!$invoice) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution invoice not found',
            ], 404);
        }

        $result = DB::transaction(function () use ($invoice) {
            $restoredToLoadQty = 0;
            $restoredToInventoryQty = 0;

            foreach ($invoice->items as $item) {
                $quantity = (float) $item->quantity;
                if ($quantity <= 0) {
                    continue;
                }

                $lineLoadId = $item->load_id ?: $invoice->load_id;
                $restored = false;

                if (!empty($lineLoadId)) {
                    $loadItem = LoadItem::where('load_id', $lineLoadId)
                        ->where('product_code', $item->item_code)
                        ->lockForUpdate()
                        ->first();

                    if ($loadItem) {
                        $loadItem->qty = (float) $loadItem->qty + $quantity;
                        $loadItem->save();
                    } else {
                        $inventoryForDefaults = null;

                        if (!empty($item->inventory_item_id)) {
                            $inventoryForDefaults = InventoryItem::lockForUpdate()->find($item->inventory_item_id);
                        }

                        if (!$inventoryForDefaults) {
                            $inventoryForDefaults = InventoryItem::where('code', $item->item_code)
                                ->lockForUpdate()
                                ->first();
                        }

                        $mappedType = $inventoryForDefaults?->type === 'raw_material' ? 'raw_material' : 'finished_product';

                        LoadItem::create([
                            'load_id' => $lineLoadId,
                            'product_code' => $item->item_code,
                            'name' => $item->item_name,
                            'type' => $mappedType,
                            'out_price' => (float) ($inventoryForDefaults?->purchase_price ?? $inventoryForDefaults?->unit_price ?? $item->unit_price ?? 0),
                            'sell_price' => (float) ($inventoryForDefaults?->sell_price ?? $item->unit_price ?? 0),
                            'qty' => $quantity,
                            'loaded_qty' => $quantity,
                        ]);
                    }

                    $restored = true;
                    $restoredToLoadQty += $quantity;
                }

                if (!$restored) {
                    $inventory = null;

                    if (!empty($item->inventory_item_id)) {
                        $inventory = InventoryItem::lockForUpdate()->find($item->inventory_item_id);
                    }

                    if (!$inventory) {
                        $inventory = InventoryItem::where('code', $item->item_code)
                            ->lockForUpdate()
                            ->first();
                    }

                    if ($inventory) {
                        $inventory->current_stock = (float) $inventory->current_stock + $quantity;
                        $inventory->save();
                        $restoredToInventoryQty += $quantity;
                    }
                }
            }

            $pendingAmount = max(0, (float) $invoice->total - (float) $invoice->paid_amount);

            if ($invoice->customer) {
                $currentOutstanding = (float) ($invoice->customer->outstanding ?? 0);
                $invoice->customer->outstanding = max(0, $currentOutstanding - $pendingAmount);
                $invoice->customer->save();
            }

            $deletedPayments = DistributionPayment::where('distribution_invoice_id', $invoice->id)->delete();

            $invoice->delete();

            return [
                'restored_to_load_qty' => round($restoredToLoadQty, 2),
                'restored_to_inventory_qty' => round($restoredToInventoryQty, 2),
                'deleted_payments' => $deletedPayments,
                'outstanding_reduced_by' => round($pendingAmount, 2),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $result,
            'message' => 'Distribution invoice deleted and stock/outstanding rolled back successfully',
        ]);
    }
}
