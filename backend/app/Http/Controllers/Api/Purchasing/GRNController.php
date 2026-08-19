<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\GoodsReceivedNote;
use App\Models\CompanyBankAccount;
use App\Models\MainCashTransaction;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseOrder;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class GRNController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = GoodsReceivedNote::with(['purchaseOrder.supplier', 'grnItems.purchaseOrderItem.inventoryItem']);

        $grns = $query->get();

        return response()->json($grns);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purchase_order_id' => 'required|exists:purchase_orders,id',
            'received_date' => 'required|date',
            'notes' => 'nullable|string',
            'discount_amount' => 'nullable|numeric|min:0',
            'payment_timing' => 'required|in:post_payment,on_time',
            'payment_type' => 'nullable|string|max:120',
            'payment_company_id' => 'nullable|integer|exists:companies,id',
            'payment_reference' => 'nullable|string|max:255',
            'paid_amount' => 'nullable|numeric|min:0',
            'payment_breakdown' => 'nullable|array',
            'payment_breakdown.*.payment_type' => 'required_with:payment_breakdown|in:cash,bank_transfer,bank_deposit,cheque,party_cheque,card',
            'payment_breakdown.*.amount' => 'required_with:payment_breakdown|numeric|min:0.01',
            'payment_breakdown.*.company_id' => 'nullable|integer|exists:companies,id',
            'payment_breakdown.*.bank_account_id' => 'nullable|integer|exists:company_bank_accounts,id',
            'payment_breakdown.*.reference' => 'nullable|string|max:255',
            'items' => 'required|array',
            'items.*.purchase_order_item_id' => 'required|exists:purchase_order_items,id',
            'items.*.received_quantity' => 'required|numeric|min:0',
            'items.*.accepted_quantity' => 'nullable|numeric|min:0',
            'items.*.rejected_quantity' => 'nullable|numeric|min:0',
            'items.*.purchase_price' => 'nullable|numeric|min:0',
            'items.*.sell_price' => 'nullable|numeric|min:0',
            'items.*.expiry_date' => 'nullable|date',
            'items.*.remarks' => 'nullable|string',
            'items.*.quality_status' => 'nullable|in:pending,accepted,rejected,partial',
        ]);

        /** @var PurchaseOrder $purchaseOrder */
        $purchaseOrder = PurchaseOrder::with('items')->findOrFail($validated['purchase_order_id']);
        $allowedPoItemIds = $purchaseOrder->items->pluck('id')->all();
        foreach ($validated['items'] as $line) {
            if (!in_array((int) $line['purchase_order_item_id'], $allowedPoItemIds, true)) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'items' => ['One or more items do not belong to the selected purchase order.'],
                    ],
                ], 422);
            }
        }

        $amounts = $this->calculateFinancials($validated['items'], $purchaseOrder, (float) ($validated['discount_amount'] ?? 0));
        $paymentTiming = (string) ($validated['payment_timing'] ?? 'post_payment');
        $paymentBreakdown = [];
        if ($paymentTiming === 'on_time') {
            $paymentBreakdown = collect($validated['payment_breakdown'] ?? [])->map(function ($line) {
                return [
                    'payment_type' => (string) ($line['payment_type'] ?? ''),
                    'amount' => round((float) ($line['amount'] ?? 0), 2),
                    'company_id' => isset($line['company_id']) && $line['company_id'] !== null ? (int) $line['company_id'] : null,
                    'bank_account_id' => isset($line['bank_account_id']) && $line['bank_account_id'] !== null ? (int) $line['bank_account_id'] : null,
                    'reference' => isset($line['reference']) ? trim((string) $line['reference']) : null,
                ];
            })->filter(fn ($line) => (float) ($line['amount'] ?? 0) > 0)->values()->all();
        }

        $inputPaidAmount = !empty($paymentBreakdown)
            ? (float) collect($paymentBreakdown)->sum('amount')
            : (float) ($validated['paid_amount'] ?? 0);

        if ($paymentTiming === 'on_time' && $inputPaidAmount <= 0) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => [
                    'paid_amount' => ['Paid amount must be greater than zero for on-time payment.'],
                ],
            ], 422);
        }

        if ($paymentTiming === 'on_time' && empty($paymentBreakdown)) {
            if (empty($validated['payment_type'])) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_type' => ['Payment type is required for on-time payment.'],
                    ],
                ], 422);
            }

            if (empty(trim((string) ($validated['payment_reference'] ?? '')))) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_reference' => ['Payment reference is required for on-time payment.'],
                    ],
                ], 422);
            }

            if ((int) ($validated['payment_company_id'] ?? 0) <= 0) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_company_id' => ['Select a company account for on-time payment.'],
                    ],
                ], 422);
            }
        }

        $normalizedPaidAmount = min(max($inputPaidAmount, 0), $amounts['net_amount']);
        $paymentStatus = $amounts['net_amount'] <= 0
            ? 'paid'
            : ($normalizedPaidAmount <= 0
                ? 'unpaid'
                : ($normalizedPaidAmount >= $amounts['net_amount'] ? 'paid' : 'partial'));
        $singlePaymentType = $paymentTiming === 'on_time' ? ($validated['payment_type'] ?? null) : null;
        $singlePaymentCompanyId = $paymentTiming === 'on_time' ? (int) ($validated['payment_company_id'] ?? 0) : null;
        $singlePaymentReference = $paymentTiming === 'on_time' ? ($validated['payment_reference'] ?? null) : null;
        $paymentType = null;
        $paymentCompanyId = null;
        $paymentReference = null;
        if ($paymentTiming === 'on_time') {
            if (!empty($paymentBreakdown)) {
                if (count($paymentBreakdown) === 1) {
                    $paymentType = $paymentBreakdown[0]['payment_type'];
                    $paymentCompanyId = $paymentBreakdown[0]['company_id'];
                    $paymentReference = $paymentBreakdown[0]['reference'];
                } else {
                    $paymentType = 'mixed';
                    $paymentReference = 'Multiple payment methods';
                }
            } else {
                $paymentType = $singlePaymentType;
                $paymentCompanyId = $singlePaymentCompanyId > 0 ? $singlePaymentCompanyId : null;
                $paymentReference = $singlePaymentReference;
            }
        }

        $grn = DB::transaction(function () use ($validated, $amounts, $normalizedPaidAmount, $paymentStatus, $paymentTiming, $paymentType, $paymentCompanyId, $paymentReference, $paymentBreakdown, $request) {
            $grn = GoodsReceivedNote::create([
                'purchase_order_id' => $validated['purchase_order_id'],
                'received_date' => $validated['received_date'],
                'notes' => $validated['notes'] ?? null,
                'status' => 'received',
                'total_amount' => $amounts['total_amount'],
                'discount_amount' => $amounts['discount_amount'],
                'net_amount' => $amounts['net_amount'],
                'payment_status' => $paymentStatus,
                'payment_timing' => $paymentTiming,
                'payment_type' => $paymentType,
                'payment_company_id' => $paymentCompanyId,
                'payment_breakdown' => $paymentTiming === 'on_time' ? $paymentBreakdown : null,
                'payment_reference' => $paymentReference,
                'paid_amount' => $normalizedPaidAmount,
                'paid_at' => $normalizedPaidAmount > 0 ? now() : null,
                'payment_note' => null,
            ]);

            // Create GRN items
            foreach ($validated['items'] as $itemData) {
                $grn->grnItems()->create([
                    'purchase_order_item_id' => $itemData['purchase_order_item_id'],
                    'received_quantity' => $itemData['received_quantity'],
                    'accepted_quantity' => $itemData['accepted_quantity'] ?? $itemData['received_quantity'],
                    'rejected_quantity' => $itemData['rejected_quantity'] ?? 0,
                    'purchase_price' => $itemData['purchase_price'] ?? null,
                    'sell_price' => $itemData['sell_price'] ?? null,
                    'expiry_date' => $itemData['expiry_date'] ?? null,
                    'remarks' => $itemData['remarks'] ?? null,
                    'quality_status' => $itemData['quality_status'] ?? 'pending',
                ]);
            }

            // Update inventory stock quantities and PO received quantities
            $grnItems = $grn->grnItems()->with('purchaseOrderItem.inventoryItem')->get();
            foreach ($grnItems as $grnItem) {
                $acceptedQty = (float) $grnItem->accepted_quantity;

                $purchaseOrderItem = $grnItem->purchaseOrderItem;
                $inventoryItem = $purchaseOrderItem?->inventoryItem;

                if ($inventoryItem && $acceptedQty !== 0.0) {
                    $inventoryItem->increment('current_stock', $acceptedQty);
                }

                if ($purchaseOrderItem && $acceptedQty !== 0.0) {
                    $purchaseOrderItem->increment('received_quantity', $acceptedQty);
                }

                if ($inventoryItem) {
                    $this->applyReceiptCommercials($inventoryItem, $purchaseOrderItem, $grnItem);
                }
            }

            if ($paymentTiming === 'on_time' && $normalizedPaidAmount > 0) {
                if (!empty($paymentBreakdown)) {
                    foreach ($paymentBreakdown as $line) {
                        $lineType = (string) ($line['payment_type'] ?? '');
                        $lineAmount = (float) ($line['amount'] ?? 0);
                        $lineReference = isset($line['reference']) ? (string) $line['reference'] : '';
                        if ($lineAmount <= 0) {
                            continue;
                        }

                        if (in_array($lineType, ['bank_transfer', 'bank_deposit'], true)) {
                            $bankAccountId = (int) ($line['bank_account_id'] ?? 0);
                            $selectedBankAccount = CompanyBankAccount::query()->lockForUpdate()->find($bankAccountId);
                            if (!$selectedBankAccount) {
                                throw new \Illuminate\Validation\ValidationException(
                                    validator([], []),
                                    response()->json([
                                        'message' => 'Validation failed',
                                        'errors' => [
                                            'payment_breakdown' => ['Invalid bank account in payment breakdown.'],
                                        ],
                                    ], 422)
                                );
                            }

                            $available = (float) ($selectedBankAccount->current_balance ?? 0);
                            if ($available < $lineAmount) {
                                throw new \Illuminate\Validation\ValidationException(
                                    validator([], []),
                                    response()->json([
                                        'message' => 'Validation failed',
                                        'errors' => [
                                            'payment_breakdown' => ['Insufficient bank account balance in payment breakdown.'],
                                        ],
                                    ], 422)
                                );
                            }

                            $selectedBankAccount->current_balance = round(max($available - $lineAmount, 0), 2);
                            $selectedBankAccount->save();

                            if ($selectedBankAccount->company) {
                                $newCompanyBankBalance = round(
                                    (float) $selectedBankAccount->company->bankAccounts()->sum('current_balance'),
                                    2
                                );
                                $selectedBankAccount->company->update([
                                    'current_bank_balance' => $newCompanyBankBalance,
                                ]);
                            }

                            MainCashTransaction::create([
                                'date' => now(),
                                'type' => 'out',
                                'amount' => $lineAmount,
                                'reference' => $lineReference !== '' ? $lineReference : $grn->grn_number,
                                'note' => 'On-time GRN Payment ' . $grn->grn_number
                                    . ' via ' . str_replace('_', ' ', $lineType)
                                    . ' | Bank: ' . ($selectedBankAccount->bank_name ?? '-')
                                    . ' | Account: ' . ($selectedBankAccount->account_no ?? '-'),
                                'created_by' => $request->user()?->id,
                            ]);
                        } else {
                            $lineCompanyId = (int) ($line['company_id'] ?? 0);
                            if ($lineCompanyId <= 0) {
                                throw new \Illuminate\Validation\ValidationException(
                                    validator([], []),
                                    response()->json([
                                        'message' => 'Validation failed',
                                        'errors' => [
                                            'payment_breakdown' => ['Select company account for each non-bank payment line.'],
                                        ],
                                    ], 422)
                                );
                            }

                            $company = $this->deductFromCompanyBalance($lineCompanyId, $lineType, $lineAmount);
                            MainCashTransaction::create([
                                'date' => now(),
                                'type' => 'out',
                                'amount' => $lineAmount,
                                'reference' => $lineReference !== '' ? $lineReference : $grn->grn_number,
                                'note' => 'On-time GRN Payment ' . $grn->grn_number
                                    . ' via ' . str_replace('_', ' ', $lineType)
                                    . ' | Company: ' . ($company->name ?? '-'),
                                'created_by' => $request->user()?->id,
                            ]);
                        }
                    }
                } else {
                    if ($paymentCompanyId === null || $paymentCompanyId <= 0) {
                        throw new \Illuminate\Validation\ValidationException(
                            validator([], []),
                            response()->json([
                                'message' => 'Validation failed',
                                'errors' => [
                                    'payment_company_id' => ['Select a company account for on-time GRN payment.'],
                                ],
                            ], 422)
                        );
                    }

                    $company = $this->deductFromCompanyBalance($paymentCompanyId, (string) $paymentType, (float) $normalizedPaidAmount);

                    MainCashTransaction::create([
                        'date' => now(),
                        'type' => 'out',
                        'amount' => $normalizedPaidAmount,
                        'reference' => $paymentReference ?: $grn->grn_number,
                        'note' => 'On-time GRN Payment ' . $grn->grn_number
                            . ' via ' . str_replace('_', ' ', (string) $paymentType)
                            . ' | Company: ' . ($company->name ?? '-'),
                        'created_by' => $request->user()?->id,
                    ]);
                }
            }

            $pendingAmount = $this->calculatePendingAmount((float) $amounts['net_amount'], (float) $normalizedPaidAmount);
            $this->syncSupplierOutstandingByPurchaseOrder((int) $validated['purchase_order_id'], 0, $pendingAmount);
            $this->syncPurchaseOrderStatusAndTotals((int) $validated['purchase_order_id']);

            return $grn;
        });

        return response()->json($grn->load(['purchaseOrder.supplier', 'grnItems.purchaseOrderItem.inventoryItem']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(GoodsReceivedNote $grn): JsonResponse
    {
        return response()->json($grn->load(['purchaseOrder.supplier', 'grnItems.purchaseOrderItem.inventoryItem']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, GoodsReceivedNote $grn): JsonResponse
    {
        $validated = $request->validate([
            'received_date' => 'sometimes|required|date',
            'notes' => 'nullable|string',
            'status' => 'sometimes|required|in:draft,received,inspected,approved,rejected',
            'discount_amount' => 'nullable|numeric|min:0',
            'payment_timing' => 'sometimes|required|in:post_payment,on_time',
            'payment_type' => 'nullable|required_if:payment_timing,on_time|string|max:120',
            'payment_company_id' => 'nullable|integer|exists:companies,id',
            'payment_reference' => 'nullable|required_if:payment_timing,on_time|string|max:255',
            'paid_amount' => 'nullable|required_if:payment_timing,on_time|numeric|min:0',
            'payment_breakdown' => 'nullable|array',
            'payment_breakdown.*.payment_type' => 'required_with:payment_breakdown|in:cash,bank_transfer,bank_deposit,cheque,party_cheque,card',
            'payment_breakdown.*.amount' => 'required_with:payment_breakdown|numeric|min:0.01',
            'payment_breakdown.*.company_id' => 'nullable|integer|exists:companies,id',
            'payment_breakdown.*.bank_account_id' => 'nullable|integer|exists:company_bank_accounts,id',
            'payment_breakdown.*.reference' => 'nullable|string|max:255',
            'items' => 'sometimes|array',
            'items.*.purchase_order_item_id' => 'required_with:items|exists:purchase_order_items,id',
            'items.*.received_quantity' => 'required_with:items|numeric|min:0',
            'items.*.accepted_quantity' => 'nullable|numeric|min:0',
            'items.*.rejected_quantity' => 'nullable|numeric|min:0',
            'items.*.purchase_price' => 'nullable|numeric|min:0',
            'items.*.sell_price' => 'nullable|numeric|min:0',
            'items.*.expiry_date' => 'nullable|date',
            'items.*.remarks' => 'nullable|string',
            'items.*.quality_status' => 'nullable|in:pending,accepted,rejected,partial',
        ]);

        if (isset($validated['items'])) {
            $purchaseOrderId = (int) ($grn->purchase_order_id);
            if (isset($validated['purchase_order_id'])) {
                $purchaseOrderId = (int) $validated['purchase_order_id'];
            }

            /** @var PurchaseOrder $purchaseOrder */
            $purchaseOrder = PurchaseOrder::with('items')->findOrFail($purchaseOrderId);
            $allowedPoItemIds = $purchaseOrder->items->pluck('id')->all();
            foreach ($validated['items'] as $line) {
                if (!in_array((int) $line['purchase_order_item_id'], $allowedPoItemIds, true)) {
                    return response()->json([
                        'message' => 'Validation failed',
                        'errors' => [
                            'items' => ['One or more items do not belong to the selected purchase order.'],
                        ],
                    ], 422);
                }
            }
        }

        if (($validated['payment_timing'] ?? ($grn->payment_timing ?? 'post_payment')) === 'on_time' && array_key_exists('paid_amount', $validated) && (float) ($validated['paid_amount'] ?? 0) <= 0) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => [
                    'paid_amount' => ['Paid amount must be greater than zero for on-time payment.'],
                ],
            ], 422);
        }

        DB::transaction(function () use (&$grn, $validated) {
            $oldGrnItems = $grn->grnItems()->get()->keyBy('purchase_order_item_id');
            $oldPendingAmount = $this->calculatePendingAmount((float) $grn->net_amount, (float) $grn->paid_amount);

            $discountAmount = array_key_exists('discount_amount', $validated)
                ? (float) $validated['discount_amount']
                : (float) $grn->discount_amount;

            $newTotalAmount = (float) $grn->total_amount;
            if (isset($validated['items'])) {
                $poForTotals = PurchaseOrder::with('items')->findOrFail((int) $grn->purchase_order_id);
                $financials = $this->calculateFinancials($validated['items'], $poForTotals, $discountAmount);
                $newTotalAmount = $financials['total_amount'];
                $discountAmount = $financials['discount_amount'];
            } else {
                $discountAmount = min(max($discountAmount, 0), $newTotalAmount);
            }

            $newNetAmount = round(max($newTotalAmount - $discountAmount, 0), 2);
            $incomingPaymentTiming = $validated['payment_timing'] ?? $grn->payment_timing ?? 'post_payment';
            $incomingPaidAmount = array_key_exists('paid_amount', $validated)
                ? (float) $validated['paid_amount']
                : (float) $grn->paid_amount;
            $existingPaidAmount = $incomingPaidAmount;
            $normalizedPaidAmount = min(max($existingPaidAmount, 0), $newNetAmount);
            $paymentStatus = $newNetAmount <= 0
                ? 'paid'
                : ($normalizedPaidAmount <= 0
                    ? 'unpaid'
                    : ($normalizedPaidAmount >= $newNetAmount ? 'paid' : 'partial'));
            $paidAt = $normalizedPaidAmount > 0
                ? ($grn->paid_at ?? now())
                : null;
            $newPendingAmount = $this->calculatePendingAmount((float) $newNetAmount, (float) $normalizedPaidAmount);

            // Update GRN header
            $grn->update([
                'received_date' => $validated['received_date'] ?? $grn->received_date,
                'notes' => $validated['notes'] ?? $grn->notes,
                'status' => $validated['status'] ?? $grn->status,
                'total_amount' => $newTotalAmount,
                'discount_amount' => $discountAmount,
                'net_amount' => $newNetAmount,
                'payment_timing' => $incomingPaymentTiming,
                'payment_type' => $incomingPaymentTiming === 'on_time'
                    ? ($validated['payment_type'] ?? $grn->payment_type)
                    : null,
                'payment_company_id' => $incomingPaymentTiming === 'on_time'
                    ? ($validated['payment_company_id'] ?? $grn->payment_company_id)
                    : null,
                'payment_breakdown' => $incomingPaymentTiming === 'on_time'
                    ? ($validated['payment_breakdown'] ?? $grn->payment_breakdown)
                    : null,
                'payment_reference' => $incomingPaymentTiming === 'on_time'
                    ? ($validated['payment_reference'] ?? $grn->payment_reference)
                    : null,
                'paid_amount' => $normalizedPaidAmount,
                'payment_status' => $paymentStatus,
                'paid_at' => $paidAt,
            ]);

            $this->syncSupplierOutstandingByPurchaseOrder((int) $grn->purchase_order_id, $oldPendingAmount, $newPendingAmount);

            if (!isset($validated['items'])) {
                return;
            }

            // Delete and recreate GRN lines
            $grn->grnItems()->delete();
            foreach ($validated['items'] as $itemData) {
                $grn->grnItems()->create([
                    'purchase_order_item_id' => $itemData['purchase_order_item_id'],
                    'received_quantity' => $itemData['received_quantity'],
                    'accepted_quantity' => $itemData['accepted_quantity'] ?? $itemData['received_quantity'],
                    'rejected_quantity' => $itemData['rejected_quantity'] ?? 0,
                    'purchase_price' => $itemData['purchase_price'] ?? null,
                    'sell_price' => $itemData['sell_price'] ?? null,
                    'expiry_date' => $itemData['expiry_date'] ?? null,
                    'remarks' => $itemData['remarks'] ?? null,
                    'quality_status' => $itemData['quality_status'] ?? 'pending',
                ]);
            }

            $newGrnItems = $grn->grnItems()->with('purchaseOrderItem.inventoryItem')->get()->keyBy('purchase_order_item_id');

            $allPoItemIds = $oldGrnItems->keys()->merge($newGrnItems->keys())->unique();
            foreach ($allPoItemIds as $poItemId) {
                $oldAccepted = (float) optional($oldGrnItems->get($poItemId))->accepted_quantity;
                $newAccepted = (float) optional($newGrnItems->get($poItemId))->accepted_quantity;
                $diff = $newAccepted - $oldAccepted;

                $purchaseOrderItem = PurchaseOrderItem::with('inventoryItem')->find($poItemId);
                if (!$purchaseOrderItem) {
                    continue;
                }

                if ($diff !== 0.0) {
                    if ($purchaseOrderItem->inventoryItem) {
                        $purchaseOrderItem->inventoryItem->increment('current_stock', $diff);
                    }
                    $purchaseOrderItem->increment('received_quantity', $diff);
                }

                $newLine = $newGrnItems->get($poItemId);
                if ($newLine && $purchaseOrderItem->inventoryItem) {
                    $this->applyReceiptCommercials($purchaseOrderItem->inventoryItem, $purchaseOrderItem, $newLine);
                }
            }

            $this->syncPurchaseOrderStatusAndTotals((int) $grn->purchase_order_id);

            $grn = $grn->fresh();
        });

        return response()->json($grn->load(['purchaseOrder.supplier', 'grnItems.purchaseOrderItem.inventoryItem']));
    }

    public function recordPayment(Request $request, GoodsReceivedNote $grn): JsonResponse
    {
        if (($grn->payment_timing ?? 'post_payment') !== 'post_payment') {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => [
                    'payment_timing' => ['Only post payment GRNs can be settled from accounts.'],
                ],
            ], 422);
        }

        $validated = $request->validate([
            'paid_amount' => 'required|numeric|min:0.01',
            'payment_type' => 'required|in:cash,bank_transfer,bank_deposit,cheque,party_cheque,card',
            'payment_company_id' => 'nullable|integer|exists:companies,id',
            'payment_reference' => 'nullable|string|max:255',
            'bank_account_id' => 'nullable|integer|exists:company_bank_accounts,id',
            'bank_name' => 'nullable|string|max:255',
            'cheque_number' => 'nullable|string|max:120',
            'cheque_date' => 'nullable|date',
            'payment_note' => 'nullable|string',
            'paid_at' => 'nullable|date',
        ]);

        if (in_array(($validated['payment_type'] ?? ''), ['cheque', 'party_cheque'], true)) {
            if (empty($validated['bank_name']) || empty($validated['cheque_number']) || empty($validated['cheque_date'])) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_type' => ['Bank name, cheque number, and cheque date are required for cheque-based payments.'],
                    ],
                ], 422);
            }
        }

        if (in_array(($validated['payment_type'] ?? ''), ['bank_transfer', 'bank_deposit'], true)) {
            if (empty($validated['bank_account_id']) || empty($validated['payment_reference'])) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_type' => ['Bank account and payment reference are required for bank transfer/deposit payments.'],
                    ],
                ], 422);
            }
        }

        if (in_array(($validated['payment_type'] ?? ''), ['cash', 'cheque', 'party_cheque', 'card'], true)) {
            if (empty($validated['payment_company_id'])) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_company_id' => ['Select a company account for this payment type.'],
                    ],
                ], 422);
            }
        }

        DB::transaction(function () use (&$grn, $validated, $request) {
            $netAmount = (float) $grn->net_amount;
            $currentPaid = (float) $grn->paid_amount;
            $incomingPaid = (float) $validated['paid_amount'];
            $newPaidAmount = round($currentPaid + $incomingPaid, 2);
            $oldPendingAmount = $this->calculatePendingAmount($netAmount, $currentPaid);

            if ($newPaidAmount > $netAmount) {
                throw new \Illuminate\Validation\ValidationException(
                    validator([], []),
                    response()->json([
                        'message' => 'Validation failed',
                        'errors' => [
                            'paid_amount' => ['Paid amount cannot exceed the GRN net amount.'],
                        ],
                    ], 422)
                );
            }

            $paymentStatus = $newPaidAmount >= $netAmount
                ? 'paid'
                : ($newPaidAmount > 0 ? 'partial' : 'unpaid');

            $selectedBankAccount = null;
            $paymentCompany = null;
            if (in_array(($validated['payment_type'] ?? ''), ['bank_transfer', 'bank_deposit'], true)) {
                $selectedBankAccount = CompanyBankAccount::find((int) $validated['bank_account_id']);
                if (!$selectedBankAccount) {
                    throw new \Illuminate\Validation\ValidationException(
                        validator([], []),
                        response()->json([
                            'message' => 'Validation failed',
                            'errors' => [
                                'bank_account_id' => ['Selected bank account is not valid.'],
                            ],
                        ], 422)
                    );
                }

                $available = (float) ($selectedBankAccount->current_balance ?? 0);
                if ($available < $incomingPaid) {
                    throw new \Illuminate\Validation\ValidationException(
                        validator([], []),
                        response()->json([
                            'message' => 'Validation failed',
                            'errors' => [
                                'paid_amount' => ['Insufficient available balance in selected company bank account.'],
                            ],
                        ], 422)
                    );
                }

                CompanyBankAccount::whereKey($selectedBankAccount->id)
                    ->update(['current_balance' => DB::raw('current_balance - ' . (float) $incomingPaid)]);
                $selectedBankAccount->refresh();

                if ($selectedBankAccount->company) {
                    $paymentCompany = $selectedBankAccount->company;
                    $newCompanyBankBalance = round(
                        (float) $selectedBankAccount->company->bankAccounts()->sum('current_balance'),
                        2
                    );
                    $selectedBankAccount->company->update([
                        'current_bank_balance' => $newCompanyBankBalance,
                    ]);
                }

                MainCashTransaction::create([
                    'date' => $validated['paid_at'] ?? now(),
                    'type' => 'out',
                    'amount' => $incomingPaid,
                    'reference' => $validated['payment_reference'] ?? $grn->grn_number,
                    'note' => 'GRN Payment ' . $grn->grn_number . ' via ' . str_replace('_', ' ', (string) $validated['payment_type'])
                        . ' | Bank: ' . ($selectedBankAccount->bank_name ?? '-')
                        . ' | Account: ' . ($selectedBankAccount->account_no ?? '-'),
                    'created_by' => $request->user()?->id,
                ]);
            } else {
                $paymentCompany = $this->deductFromCompanyBalance(
                    (int) $validated['payment_company_id'],
                    (string) $validated['payment_type'],
                    (float) $incomingPaid
                );

                MainCashTransaction::create([
                    'date' => $validated['paid_at'] ?? now(),
                    'type' => 'out',
                    'amount' => $incomingPaid,
                    'reference' => $validated['payment_reference'] ?? $grn->grn_number,
                    'note' => 'GRN Payment ' . $grn->grn_number . ' via ' . str_replace('_', ' ', (string) $validated['payment_type'])
                        . ' | Company: ' . ($paymentCompany->name ?? '-'),
                    'created_by' => $request->user()?->id,
                ]);
            }

            $existingNote = trim((string) ($grn->payment_note ?? ''));
            $incomingNote = trim((string) ($validated['payment_note'] ?? ''));
            $paymentMetaParts = [
                'Type: ' . str_replace('_', ' ', (string) ($validated['payment_type'] ?? '')),
            ];

            if (!empty($validated['payment_reference'])) {
                $paymentMetaParts[] = 'Reference: ' . $validated['payment_reference'];
            }
            if ($selectedBankAccount) {
                $paymentMetaParts[] = 'Bank: ' . ($selectedBankAccount->bank_name ?? '-');
                $paymentMetaParts[] = 'Account: ' . ($selectedBankAccount->account_no ?? '-');
            } elseif (!empty($validated['bank_name'])) {
                $paymentMetaParts[] = 'Bank: ' . $validated['bank_name'];
            }
            if ($paymentCompany) {
                $paymentMetaParts[] = 'Company: ' . ($paymentCompany->name ?? '-');
            }
            if (!empty($validated['cheque_number'])) {
                $paymentMetaParts[] = 'Cheque #: ' . $validated['cheque_number'];
            }
            if (!empty($validated['cheque_date'])) {
                $paymentMetaParts[] = 'Cheque Date: ' . $validated['cheque_date'];
            }

            $metaNote = implode(' | ', $paymentMetaParts);
            $incomingNote = trim($metaNote . ($incomingNote !== '' ? "\n" . $incomingNote : ''));
            $note = $existingNote;
            if ($incomingNote !== '') {
                $note = $existingNote !== '' ? $existingNote . "\n" . $incomingNote : $incomingNote;
            }

            $grn->update([
                'paid_amount' => $newPaidAmount,
                'payment_status' => $paymentStatus,
                'payment_type' => $validated['payment_type'] ?? $grn->payment_type,
                'payment_company_id' => $paymentCompany?->id ?? $grn->payment_company_id,
                'payment_reference' => $validated['payment_reference'] ?? $grn->payment_reference,
                'paid_at' => $validated['paid_at'] ?? now(),
                'payment_note' => $note !== '' ? $note : null,
            ]);

            $newPendingAmount = $this->calculatePendingAmount($netAmount, $newPaidAmount);
            $this->syncSupplierOutstandingByPurchaseOrder((int) $grn->purchase_order_id, $oldPendingAmount, $newPendingAmount);

            $grn = $grn->fresh();
        });

        return response()->json(
            $grn->fresh()->load(['purchaseOrder.supplier', 'grnItems.purchaseOrderItem.inventoryItem'])
        );
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(GoodsReceivedNote $grn): JsonResponse
    {
        DB::transaction(function () use ($grn) {
            $pendingAmount = $this->calculatePendingAmount((float) $grn->net_amount, (float) $grn->paid_amount);

            // Load GRN with relationships if not already loaded
            $grn->load(['grnItems.purchaseOrderItem.inventoryItem']);

            // Reverse inventory stock updates and PO received quantities
            foreach ($grn->grnItems as $grnItem) {
                $acceptedQty = (float) $grnItem->accepted_quantity;
                $purchaseOrderItem = $grnItem->purchaseOrderItem;
                $inventoryItem = $purchaseOrderItem?->inventoryItem;

                if ($inventoryItem && $acceptedQty !== 0.0) {
                    $inventoryItem->decrement('current_stock', $acceptedQty);
                }

                if ($purchaseOrderItem && $acceptedQty !== 0.0) {
                    $purchaseOrderItem->decrement('received_quantity', $acceptedQty);
                }
            }

            $this->syncSupplierOutstandingByPurchaseOrder((int) $grn->purchase_order_id, $pendingAmount, 0);
            $this->syncPurchaseOrderStatusAndTotals((int) $grn->purchase_order_id);

            $grn->delete();
        });

        return response()->json(['message' => 'GRN deleted successfully']);
    }

    private function applyReceiptCommercials($inventoryItem, ?PurchaseOrderItem $purchaseOrderItem, $grnItem): void
    {
        $existingUnit = (float) ($inventoryItem->unit_price ?? 0);
        $existingPurchase = (float) ($inventoryItem->purchase_price ?? 0);
        $existingSell = (float) ($inventoryItem->sell_price ?? 0);
        $poUnit = (float) ($purchaseOrderItem?->unit_price ?? 0);
        $grnPurchase = $grnItem->purchase_price !== null ? (float) $grnItem->purchase_price : null;
        $grnSell = $grnItem->sell_price !== null ? (float) $grnItem->sell_price : null;

        $resolvedPurchase = $grnPurchase;
        if ($resolvedPurchase === null || $resolvedPurchase <= 0) {
            $resolvedPurchase = $poUnit > 0 ? $poUnit : ($existingPurchase > 0 ? $existingPurchase : $existingUnit);
        }

        $resolvedUnit = $resolvedPurchase > 0 ? $resolvedPurchase : ($existingUnit > 0 ? $existingUnit : $poUnit);
        $resolvedSell = $grnSell !== null ? $grnSell : $existingSell;

        $updatePayload = [
            'unit_price' => $resolvedUnit,
            'purchase_price' => $resolvedPurchase,
            'sell_price' => $resolvedSell,
        ];

        if (!empty($grnItem->expiry_date)) {
            $updatePayload['expiry_date'] = $grnItem->expiry_date;
        }

        $inventoryItem->update($updatePayload);
    }

    private function calculateFinancials(array $lines, PurchaseOrder $purchaseOrder, float $discountAmount): array
    {
        $purchaseOrderItems = $purchaseOrder->items->keyBy('id');
        $totalAmount = 0;

        foreach ($lines as $line) {
            $acceptedQty = (float) ($line['accepted_quantity'] ?? $line['received_quantity'] ?? 0);
            $itemId = (int) ($line['purchase_order_item_id'] ?? 0);
            $purchasePrice = array_key_exists('purchase_price', $line) && $line['purchase_price'] !== null
                ? (float) $line['purchase_price']
                : (float) optional($purchaseOrderItems->get($itemId))->unit_price;

            $totalAmount += max($acceptedQty, 0) * max($purchasePrice, 0);
        }

        $totalAmount = round($totalAmount, 2);
        $discountAmount = round(min(max($discountAmount, 0), $totalAmount), 2);
        $netAmount = round(max($totalAmount - $discountAmount, 0), 2);

        return [
            'total_amount' => $totalAmount,
            'discount_amount' => $discountAmount,
            'net_amount' => $netAmount,
        ];
    }

    private function calculatePendingAmount(float $netAmount, float $paidAmount): float
    {
        return round(max($netAmount - $paidAmount, 0), 2);
    }

    private function resolveBalanceFieldByPaymentType(string $paymentType): ?string
    {
        return match ($paymentType) {
            'cash' => 'current_cash_balance',
            'cheque', 'party_cheque' => 'current_cheque_balance',
            'bank_transfer', 'bank_deposit',
            'card' => 'current_bank_balance',
            default => null,
        };
    }

    private function deductFromCompanyBalance(int $companyId, string $paymentType, float $amount): Company
    {
        $balanceField = $this->resolveBalanceFieldByPaymentType($paymentType);
        if ($balanceField === null) {
            throw new \Illuminate\Validation\ValidationException(
                validator([], []),
                response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_type' => ['Unsupported payment type for company balance deduction.'],
                    ],
                ], 422)
            );
        }

        /** @var Company|null $company */
        $company = Company::query()->lockForUpdate()->find($companyId);
        if (!$company) {
            throw new \Illuminate\Validation\ValidationException(
                validator([], []),
                response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'payment_company_id' => ['Selected company account is not valid.'],
                    ],
                ], 422)
            );
        }

        $available = (float) ($company->{$balanceField} ?? 0);
        if ($available < $amount) {
            throw new \Illuminate\Validation\ValidationException(
                validator([], []),
                response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'paid_amount' => [
                            'Insufficient company balance for this payment type. Available: LKR ' . number_format($available, 2, '.', ''),
                        ],
                    ],
                ], 422)
            );
        }

        $company->{$balanceField} = round(max($available - $amount, 0), 2);
        $company->save();

        return $company;
    }

    private function syncSupplierOutstandingByPurchaseOrder(int $purchaseOrderId, float $oldPendingAmount, float $newPendingAmount): void
    {
        $delta = round($newPendingAmount - $oldPendingAmount, 2);
        if ($delta === 0.0) {
            return;
        }

        $purchaseOrder = PurchaseOrder::with('supplier')->find($purchaseOrderId);
        $supplier = $purchaseOrder?->supplier;
        if (!$supplier) {
            return;
        }

        $currentOutstanding = (float) ($supplier->outstanding_balance ?? 0);
        $supplier->outstanding_balance = max(0, round($currentOutstanding + $delta, 2));
        $supplier->save();
    }

    private function syncPurchaseOrderStatusAndTotals(int $purchaseOrderId): void
    {
        $purchaseOrder = PurchaseOrder::with('items')->find($purchaseOrderId);
        if (!$purchaseOrder) {
            return;
        }

        $allItemsCompleted = true;
        $hasAnyReceived = false;
        $calculatedTotalAmount = 0.0;

        foreach ($purchaseOrder->items as $poItem) {
            $orderedQty = (float) ($poItem->quantity ?? 0);

            $actualReceivedQty = (float) GoodsReceivedNote::query()
                ->join('grn_items', 'goods_received_notes.id', '=', 'grn_items.grn_id')
                ->where('goods_received_notes.purchase_order_id', $purchaseOrderId)
                ->where('grn_items.purchase_order_item_id', $poItem->id)
                ->sum('grn_items.accepted_quantity');

            $actualReceivedQty = round(max($actualReceivedQty, 0), 2);
            if ((float) ($poItem->received_quantity ?? 0) !== $actualReceivedQty) {
                $poItem->received_quantity = $actualReceivedQty;
            }

            if ($actualReceivedQty > 0) {
                $hasAnyReceived = true;
            }
            if ($orderedQty > 0 && $actualReceivedQty < $orderedQty) {
                $allItemsCompleted = false;
            }

            $latestGrnPrice = (float) DB::table('grn_items')
                ->where('purchase_order_item_id', $poItem->id)
                ->whereNotNull('purchase_price')
                ->where('purchase_price', '>', 0)
                ->orderByDesc('id')
                ->value('purchase_price');

            $effectiveUnitPrice = (float) ($poItem->unit_price ?? 0);
            if ($effectiveUnitPrice <= 0 && $latestGrnPrice > 0) {
                $effectiveUnitPrice = $latestGrnPrice;
                $poItem->unit_price = $effectiveUnitPrice;
            }

            $lineTotal = round(max($orderedQty, 0) * max($effectiveUnitPrice, 0), 2);
            if ((float) ($poItem->total_price ?? 0) !== $lineTotal) {
                $poItem->total_price = $lineTotal;
            }

            if ($poItem->isDirty()) {
                $poItem->save();
            }

            $calculatedTotalAmount += $lineTotal;
        }

        $calculatedTotalAmount = round(max($calculatedTotalAmount, 0), 2);

        $nextStatus = (string) ($purchaseOrder->status ?? 'pending');
        if ($purchaseOrder->items->isNotEmpty() && $allItemsCompleted) {
            $nextStatus = 'received';
        } elseif ($hasAnyReceived && in_array($nextStatus, ['pending', 'received'], true)) {
            $nextStatus = 'approved';
        }

        $purchaseOrder->update([
            'status' => $nextStatus,
            'total_amount' => $calculatedTotalAmount,
        ]);
    }
}
