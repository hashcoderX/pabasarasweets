<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionReturn;
use App\Models\InventoryItem;
use App\Models\Load;
use App\Models\LoadItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DistributionReturnController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DistributionReturn::with([
            'customer:id,shop_name,customer_code',
            'invoice:id,invoice_number',
            'returnedItem:id,name,code,unit',
            'exchangeItem:id,name,code,unit',
        ]);

        $user = $request->user();

        if ($user) {
            $isAdmin = (!$user->employee_id) || $user->hasRole('Super Admin');

            if (!$isAdmin && $user->employee_id) {
                $routeIds = Load::where('sales_ref_id', $user->employee_id)
                    ->whereIn('status', ['pending', 'in_transit', 'delivered'])
                    ->pluck('route_id')
                    ->filter()
                    ->unique()
                    ->toArray();

                if (!empty($routeIds)) {
                    $query->whereHas('customer', function ($q) use ($routeIds) {
                        $q->whereIn('route_id', $routeIds);
                    });
                } else {
                    // No allocated routes for this sales ref - hide returns
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

        $returns = $query->orderByDesc('return_date')->orderByDesc('id')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $returns,
            'message' => 'Distribution returns retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'return_number' => 'required|string|max:60|unique:distribution_returns,return_number',
            'distribution_invoice_id' => 'nullable|exists:distribution_invoices,id',
            'load_id' => 'nullable|exists:loads,id',
            'customer_id' => 'required|exists:distribution_customers,id',
            'returned_inventory_item_id' => 'nullable|exists:inventory_items,id',
            'return_date' => 'required|date',
            'total_quantity' => 'required|numeric|min:0',
            'total_amount' => 'required|numeric|min:0',
            'settlement_type' => 'nullable|in:bill_deduction,cash_refund,item_exchange',
            'settlement_amount' => 'nullable|numeric|min:0',
            'exchange_inventory_item_id' => 'nullable|exists:inventory_items,id',
            'exchange_quantity' => 'nullable|numeric|min:0',
            'return_lines' => 'nullable|array',
            'return_lines.*.inventory_item_id' => 'nullable|exists:inventory_items,id',
            'return_lines.*.item_code' => 'required_with:return_lines|string|max:80',
            'return_lines.*.item_name' => 'nullable|string|max:255',
            'return_lines.*.quantity' => 'required_with:return_lines|numeric|min:0',
            'return_lines.*.unit_price' => 'nullable|numeric|min:0',
            'return_lines.*.amount' => 'nullable|numeric|min:0',
            'return_lines.*.is_damaged' => 'nullable|boolean',
            'reason' => 'nullable|string|max:255',
            'status' => 'nullable|in:pending,approved,rejected',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        $distributionReturn = DB::transaction(function () use ($payload) {
            $returnsHasLoadId = Schema::hasColumn('distribution_returns', 'load_id');
            $settlementType = $payload['settlement_type'] ?? 'bill_deduction';
            $settlementAmount = (float) ($payload['settlement_amount'] ?? $payload['total_amount'] ?? 0);

            $loadId = null;
            if (!empty($payload['distribution_invoice_id'])) {
                $invoice = DistributionInvoice::find($payload['distribution_invoice_id']);
                if ($invoice) {
                    $loadId = $invoice->load_id;
                }
            }

            if (!$loadId && !empty($payload['load_id'])) {
                $loadId = $payload['load_id'];
            }

            $returnData = [
                'return_number' => $payload['return_number'],
                'distribution_invoice_id' => $payload['distribution_invoice_id'] ?? null,
                'customer_id' => $payload['customer_id'],
                'returned_inventory_item_id' => $payload['returned_inventory_item_id'] ?? null,
                'return_date' => $payload['return_date'],
                'total_quantity' => $payload['total_quantity'],
                'total_amount' => $payload['total_amount'],
                'settlement_type' => $settlementType,
                'settlement_amount' => $settlementAmount,
                'exchange_inventory_item_id' => $payload['exchange_inventory_item_id'] ?? null,
                'exchange_quantity' => (float) ($payload['exchange_quantity'] ?? 0),
                'reason' => $payload['reason'] ?? null,
                'status' => $payload['status'] ?? 'pending',
                'notes' => $payload['notes'] ?? null,
            ];

            if ($returnsHasLoadId) {
                $returnData['load_id'] = $loadId;
            }

            $distributionReturn = DistributionReturn::create($returnData);

            if (!empty($payload['returned_inventory_item_id']) && (float) $payload['total_quantity'] > 0) {
                $inventory = InventoryItem::find($payload['returned_inventory_item_id']);
                if ($inventory) {
                    $inventory->current_stock = (float) $inventory->current_stock + (float) $payload['total_quantity'];
                    $inventory->save();
                }
            }

            if ($settlementType === 'item_exchange' && !empty($payload['exchange_inventory_item_id']) && (float) ($payload['exchange_quantity'] ?? 0) > 0) {
                $exchangeItem = InventoryItem::find($payload['exchange_inventory_item_id']);
                if ($exchangeItem) {
                    $exchangeQty = (float) ($payload['exchange_quantity'] ?? 0);
                    $exchangeItem->current_stock = max(0, (float) $exchangeItem->current_stock - $exchangeQty);
                    $exchangeItem->save();
                }
            }

            if ($loadId) {
                $lineEntries = $this->resolveReturnLineEntries($payload);

                if (empty($lineEntries) && !empty($payload['returned_inventory_item_id']) && (float) ($payload['total_quantity'] ?? 0) > 0) {
                    $fallbackItem = InventoryItem::find($payload['returned_inventory_item_id']);
                    if ($fallbackItem) {
                        $qty = (float) ($payload['total_quantity'] ?? 0);
                        $isDamagedFallback = $settlementType !== 'item_exchange';
                        $lineEntries[] = [
                            'item_code' => (string) ($fallbackItem->code ?? ''),
                            'item_name' => (string) ($fallbackItem->name ?? ''),
                            'quantity' => $qty,
                            'unit_price' => $qty > 0 ? ((float) ($payload['total_amount'] ?? 0) / $qty) : 0,
                            'is_damaged' => $isDamagedFallback,
                        ];
                    }
                }

                foreach ($lineEntries as $entry) {
                    $isDamaged = filter_var($entry['is_damaged'] ?? false, FILTER_VALIDATE_BOOLEAN);
                    if ($isDamaged) {
                        // Damaged returns must not be restored to load availability.
                        continue;
                    }

                    $itemCode = trim((string) ($entry['item_code'] ?? ''));
                    $itemName = trim((string) ($entry['item_name'] ?? ''));
                    $qty = (float) ($entry['quantity'] ?? 0);
                    $unitPrice = (float) ($entry['unit_price'] ?? 0);

                    if ($itemCode === '' || $qty <= 0) {
                        continue;
                    }

                    $loadItem = LoadItem::where('load_id', (int) $loadId)
                        ->where('product_code', $itemCode)
                        ->first();

                    if ($loadItem) {
                        $loadItem->qty = (float) $loadItem->qty + $qty;
                        $loadItem->save();
                        continue;
                    }

                    LoadItem::create([
                        'load_id' => (int) $loadId,
                        'product_code' => $itemCode,
                        'name' => $itemName !== '' ? $itemName : $itemCode,
                        'type' => 'finished_product',
                        'out_price' => max(0, $unitPrice),
                        'sell_price' => max(0, $unitPrice),
                        'qty' => $qty,
                        // Return-only items were not part of the original load.
                        'loaded_qty' => 0,
                    ]);
                }
            }

            if (!empty($payload['distribution_invoice_id'])) {
                $invoice = DistributionInvoice::find($payload['distribution_invoice_id']);
                if ($invoice) {
                    if ($settlementType === 'bill_deduction') {
                        $invoice->total = max(0, (float) $invoice->total - $settlementAmount);
                    } elseif ($settlementType === 'cash_refund') {
                        $invoice->paid_amount = max(0, (float) $invoice->paid_amount - $settlementAmount);
                    }

                    if ((float) $invoice->paid_amount >= (float) $invoice->total) {
                        $invoice->status = 'paid';
                    } elseif ((float) $invoice->paid_amount > 0) {
                        $invoice->status = 'partial';
                    } else {
                        $invoice->status = 'pending';
                    }

                    $invoice->save();
                }
            }

            return $distributionReturn;
        });

        return response()->json([
            'success' => true,
            'data' => $distributionReturn->load([
                'customer:id,shop_name,customer_code',
                'invoice:id,invoice_number',
                'returnedItem:id,name,code,unit',
                'exchangeItem:id,name,code,unit',
            ]),
            'message' => 'Distribution return recorded successfully',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $distributionReturn = DistributionReturn::with([
            'customer:id,shop_name,customer_code',
            'invoice:id,invoice_number',
            'returnedItem:id,name,code,unit',
            'exchangeItem:id,name,code,unit',
        ])->find($id);

        if (!$distributionReturn) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution return not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $distributionReturn,
            'message' => 'Distribution return retrieved successfully',
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $distributionReturn = DistributionReturn::find($id);

        if (!$distributionReturn) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution return not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'return_date' => 'required|date',
            'reason' => 'nullable|string|max:255',
            'status' => 'nullable|in:pending,approved,rejected',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $distributionReturn->update($validator->validated());

        return response()->json([
            'success' => true,
            'data' => $distributionReturn->load([
                'customer:id,shop_name,customer_code',
                'invoice:id,invoice_number',
                'returnedItem:id,name,code,unit',
                'exchangeItem:id,name,code,unit',
            ]),
            'message' => 'Distribution return updated successfully',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $distributionReturn = DistributionReturn::find($id);

        if (!$distributionReturn) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution return not found',
            ], 404);
        }

        $distributionReturn->delete();

        return response()->json([
            'success' => true,
            'message' => 'Distribution return deleted successfully',
        ]);
    }

    private function resolveReturnLineEntries(array $payload): array
    {
        if (!empty($payload['return_lines']) && is_array($payload['return_lines'])) {
            return $payload['return_lines'];
        }

        $notes = (string) ($payload['notes'] ?? '');
        if ($notes === '') {
            return [];
        }

        $entries = [];
        $lines = preg_split('/\r\n|\r|\n/', $notes) ?: [];
        foreach ($lines as $line) {
            $trimmed = trim((string) $line);
            if (!str_starts_with($trimmed, '- ')) {
                continue;
            }

            if (!preg_match('/^-\s*([0-9]+(?:\.[0-9]+)?)\s*x\s*(.*?)\s*\(([^)]+)\)\s*@\s*([0-9]+(?:\.[0-9]+)?)/', $trimmed, $matches)) {
                continue;
            }

            $entries[] = [
                'quantity' => (float) ($matches[1] ?? 0),
                'item_name' => trim((string) ($matches[2] ?? '')),
                'item_code' => trim((string) ($matches[3] ?? '')),
                'unit_price' => (float) ($matches[4] ?? 0),
            ];
        }

        return $entries;
    }
}
