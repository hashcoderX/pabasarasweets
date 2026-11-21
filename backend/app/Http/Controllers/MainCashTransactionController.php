<?php

namespace App\Http\Controllers;

use App\Models\OutletSale;
use App\Models\Company;
use App\Models\CompanyBankAccount;
use App\Models\MainCashTransaction;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class MainCashTransactionController extends Controller
{
    private function resolveOutletTransferBreakdown(int $outletId, string $sessionDate): array
    {
        $targetDate = Carbon::parse($sessionDate)->toDateString();

        $openingAmount = 0.0;
        if (Schema::hasTable('outlet_cash_drawer_sessions')) {
            $session = DB::table('outlet_cash_drawer_sessions')
                ->where('outlet_id', $outletId)
                ->whereDate('session_date', $targetDate)
                ->orderByDesc('id')
                ->first(['opening_balance']);
            $openingAmount = (float) ($session->opening_balance ?? 0);
        }

        $summary = [
            'total_sale' => 0.0,
            'card_collection_total' => 0.0,
            'bank_transfer_total' => 0.0,
            'cash_collection_total' => 0.0,
        ];

        $outletSales = OutletSale::query()
            ->where('outlet_id', $outletId)
            ->whereDate('sale_date', $targetDate)
            ->get(['total_amount', 'paid_amount', 'payment_type']);

        if ($outletSales->isNotEmpty()) {
            $summary['total_sale'] = (float) $outletSales->sum(fn ($sale) => (float) ($sale->total_amount ?? 0));
            $summary['card_collection_total'] = (float) $outletSales
                ->filter(fn ($sale) => strtolower((string) ($sale->payment_type ?? 'cash')) === 'card')
                ->sum(fn ($sale) => (float) ($sale->paid_amount ?? 0));
            $summary['bank_transfer_total'] = (float) $outletSales
                ->filter(function ($sale) {
                    $type = strtolower((string) ($sale->payment_type ?? 'cash'));
                    return $type === 'bank' || $type === 'bank_transfer';
                })
                ->sum(fn ($sale) => (float) ($sale->paid_amount ?? 0));
            $summary['cash_collection_total'] = (float) $outletSales
                ->filter(fn ($sale) => strtolower((string) ($sale->payment_type ?? 'cash')) === 'cash')
                ->sum(fn ($sale) => (float) ($sale->paid_amount ?? 0));
        } elseif (Schema::hasTable('orders')) {
            $orderRows = DB::table('orders')
                ->where('outlet_id', $outletId)
                ->whereDate('order_date', $targetDate)
                ->get(['total_amount', 'paid_amount', 'payment_type']);

            $summary['total_sale'] = (float) $orderRows->sum(fn ($row) => (float) ($row->total_amount ?? 0));
            $summary['card_collection_total'] = (float) $orderRows
                ->filter(fn ($row) => strtolower((string) ($row->payment_type ?? 'cash')) === 'card')
                ->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
            $summary['bank_transfer_total'] = (float) $orderRows
                ->filter(function ($row) {
                    $type = strtolower((string) ($row->payment_type ?? 'cash'));
                    return $type === 'bank' || $type === 'bank_transfer';
                })
                ->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
            $summary['cash_collection_total'] = (float) $orderRows
                ->filter(fn ($row) => strtolower((string) ($row->payment_type ?? 'cash')) === 'cash')
                ->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
        }

        return [
            'session_date' => $targetDate,
            'start_amount' => $openingAmount,
            'total_sale' => $summary['total_sale'],
            'card_collection_total' => $summary['card_collection_total'],
            'bank_transfer_total' => $summary['bank_transfer_total'],
            'cash_collection_total' => $summary['cash_collection_total'],
        ];
    }

    private function isAdmin($user): bool
    {
        if (!$user || !$user->employee_id) {
            return true;
        }

        $user->loadMissing('roles');

        $roles = $user->roles
            ->pluck('name')
            ->push((string) ($user->role ?? ''))
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter();

        return $roles->contains(function ($roleName) {
            return str_contains($roleName, 'super admin')
                || str_contains($roleName, 'superadmin')
                || str_contains($roleName, 'administrator')
                || $roleName === 'admin';
        });
    }

    public function index(Request $request): JsonResponse
    {
        $query = MainCashTransaction::query();

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('search')) {
            $term = $request->input('search');
            $query->where(function ($q) use ($term) {
                $q->where('reference', 'like', "%{$term}%")
                    ->orWhere('note', 'like', "%{$term}%");
            });
        }

        $transactions = $query
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 100));

        return response()->json([
            'success' => true,
            'data' => $transactions,
            'message' => 'Main cash transactions retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'date' => 'required|date',
            'type' => 'required|in:in,out',
            'amount' => 'required|numeric|gt:0',
            'reference' => 'nullable|string|max:100',
            'note' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        $transaction = MainCashTransaction::create([
            'date' => $payload['date'],
            'type' => $payload['type'],
            'amount' => $payload['amount'],
            'reference' => $payload['reference'] ?? null,
            'note' => $payload['note'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'data' => $transaction,
            'message' => 'Main cash transaction recorded successfully',
        ], 201);
    }

    public function destroy(string $id): JsonResponse
    {
        $transaction = MainCashTransaction::find($id);

        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Main cash transaction not found',
            ], 404);
        }

        $transaction->delete();

        return response()->json([
            'success' => true,
            'message' => 'Main cash transaction deleted successfully',
        ]);
    }

    public function pendingOutletTransfers(Request $request): JsonResponse
    {
        if (!Schema::hasTable('outlet_cash_drawer_transfers')) {
            return response()->json([
                'success' => true,
                'data' => [],
                'message' => 'Outlet transfer table not available',
            ]);
        }

        $rows = DB::table('outlet_cash_drawer_transfers as t')
            ->leftJoin('outlets as o', 'o.id', '=', 't.outlet_id')
            ->leftJoin('users as u', 'u.id', '=', 't.requested_by')
            ->where('t.status', 'pending')
            ->orderByDesc('t.requested_at')
            ->orderByDesc('t.id')
            ->get([
                't.id',
                't.outlet_id',
                'o.name as outlet_name',
                'o.code as outlet_code',
                't.session_date',
                't.amount',
                't.status',
                't.requested_at',
                'u.name as requested_by_name',
                't.note',
            ]);

        $outletIds = $rows
            ->map(fn ($row) => (int) ($row->outlet_id ?? 0))
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        $sessionDates = $rows
            ->map(function ($row) {
                $raw = trim((string) ($row->session_date ?? ''));
                if ($raw === '') {
                    return '';
                }
                try {
                    return Carbon::parse($raw)->toDateString();
                } catch (\Throwable $e) {
                    return substr($raw, 0, 10);
                }
            })
            ->filter()
            ->unique()
            ->values();

        $sessionDateSet = $sessionDates->flip();

        $openingByOutletDate = collect();
        if ($outletIds->isNotEmpty() && $sessionDates->isNotEmpty() && Schema::hasTable('outlet_cash_drawer_sessions')) {
            $openingByOutletDate = DB::table('outlet_cash_drawer_sessions')
                ->whereIn('outlet_id', $outletIds->all())
                ->where(function ($query) use ($sessionDates) {
                    foreach ($sessionDates as $sessionDate) {
                        $query->orWhereDate('session_date', (string) $sessionDate);
                    }
                })
                ->get(['outlet_id', 'session_date', 'opening_balance'])
                ->mapWithKeys(function ($session) {
                    $normalizedDate = Carbon::parse((string) $session->session_date)->toDateString();
                    $key = (int) $session->outlet_id . '|' . $normalizedDate;
                    return [$key => (float) ($session->opening_balance ?? 0)];
                });
        }

        $outletSalesSummaryByOutletDate = collect();
        if ($outletIds->isNotEmpty() && $sessionDates->isNotEmpty()) {
            $minDate = (string) $sessionDates->min();
            $maxDate = (string) $sessionDates->max();

            $outletSalesSummaryByOutletDate = OutletSale::query()
                ->whereIn('outlet_id', $outletIds->all())
                ->whereDate('sale_date', '>=', $minDate)
                ->whereDate('sale_date', '<=', $maxDate)
                ->get(['outlet_id', 'sale_date', 'total_amount', 'paid_amount', 'payment_type'])
                ->reduce(function ($carry, $sale) use ($sessionDateSet) {
                    $saleDate = Carbon::parse((string) $sale->sale_date)->toDateString();
                    if (!$sessionDateSet->has($saleDate)) {
                        return $carry;
                    }

                    $key = (int) $sale->outlet_id . '|' . $saleDate;
                    $type = strtolower((string) ($sale->payment_type ?? 'cash'));
                    $paid = (float) ($sale->paid_amount ?? 0);

                    if (!isset($carry[$key])) {
                        $carry[$key] = [
                            'total_sale' => 0.0,
                            'start_amount' => 0.0,
                            'card_collection_total' => 0.0,
                            'bank_transfer_total' => 0.0,
                            'cash_collection_total' => 0.0,
                        ];
                    }

                    $carry[$key]['total_sale'] += (float) ($sale->total_amount ?? 0);
                    if ($type === 'card') {
                        $carry[$key]['card_collection_total'] += $paid;
                    } elseif ($type === 'bank' || $type === 'bank_transfer') {
                        $carry[$key]['bank_transfer_total'] += $paid;
                    } elseif ($type === 'cash') {
                        $carry[$key]['cash_collection_total'] += $paid;
                    }

                    return $carry;
                }, []);
        }

        $orderSalesSummaryByOutletDate = collect();
        if ($outletIds->isNotEmpty() && $sessionDates->isNotEmpty() && Schema::hasTable('orders')) {
            $minDate = (string) $sessionDates->min();
            $maxDate = (string) $sessionDates->max();

            $orderSalesSummaryByOutletDate = DB::table('orders')
                ->whereIn('outlet_id', $outletIds->all())
                ->whereDate('order_date', '>=', $minDate)
                ->whereDate('order_date', '<=', $maxDate)
                ->get(['outlet_id', 'order_date', 'total_amount', 'paid_amount', 'payment_type'])
                ->reduce(function ($carry, $sale) use ($sessionDateSet) {
                    $saleDate = Carbon::parse((string) $sale->order_date)->toDateString();
                    if (!$sessionDateSet->has($saleDate)) {
                        return $carry;
                    }

                    $key = (int) $sale->outlet_id . '|' . $saleDate;
                    $type = strtolower((string) ($sale->payment_type ?? 'cash'));
                    $paid = (float) ($sale->paid_amount ?? 0);

                    if (!isset($carry[$key])) {
                        $carry[$key] = [
                            'total_sale' => 0.0,
                            'start_amount' => 0.0,
                            'card_collection_total' => 0.0,
                            'bank_transfer_total' => 0.0,
                            'cash_collection_total' => 0.0,
                        ];
                    }

                    $carry[$key]['total_sale'] += (float) ($sale->total_amount ?? 0);
                    if ($type === 'card') {
                        $carry[$key]['card_collection_total'] += $paid;
                    } elseif ($type === 'bank' || $type === 'bank_transfer') {
                        $carry[$key]['bank_transfer_total'] += $paid;
                    } elseif ($type === 'cash') {
                        $carry[$key]['cash_collection_total'] += $paid;
                    }

                    return $carry;
                }, []);
        }

        $detailedRows = $rows->map(function ($row) use ($openingByOutletDate, $outletSalesSummaryByOutletDate, $orderSalesSummaryByOutletDate) {
            $outletId = (int) ($row->outlet_id ?? 0);
            $rawSessionDate = trim((string) ($row->session_date ?? ''));
            $sessionDate = $rawSessionDate !== '' ? Carbon::parse($rawSessionDate)->toDateString() : '';
            $key = $outletId . '|' . $sessionDate;
            $summary = $outletSalesSummaryByOutletDate[$key] ?? [
                'total_sale' => 0.0,
                'start_amount' => 0.0,
                'card_collection_total' => 0.0,
                'bank_transfer_total' => 0.0,
                'cash_collection_total' => 0.0,
            ];
            if ((float) ($summary['total_sale'] ?? 0) <= 0) {
                $summary = $orderSalesSummaryByOutletDate[$key] ?? $summary;
            }
            $summary['start_amount'] = (float) ($openingByOutletDate->get($key, 0) ?? 0);

            return (object) array_merge((array) $row, [
                'session_date' => $sessionDate !== '' ? $sessionDate : $row->session_date,
            ], $summary);
        });

        return response()->json([
            'success' => true,
            'data' => $detailedRows,
            'message' => 'Pending outlet transfers retrieved successfully',
        ]);
    }

    public function pendingDeliveryCompletionCashTransfers(Request $request): JsonResponse
    {
        if (!Schema::hasTable('delivery_completion_cash_transfers')) {
            return response()->json([
                'success' => true,
                'data' => [],
                'message' => 'Delivery completion cash transfer table not available',
            ]);
        }

        $rows = DB::table('delivery_completion_cash_transfers as t')
            ->leftJoin('users as u', 'u.id', '=', 't.requested_by')
            ->where('t.status', 'pending')
            ->orderByDesc('t.requested_at')
            ->orderByDesc('t.id')
            ->get([
                't.id',
                't.load_id',
                't.load_number',
                't.delivery_date',
                't.amount',
                't.status',
                't.requested_at',
                't.note',
                'u.name as requested_by_name',
            ]);

        return response()->json([
            'success' => true,
            'data' => $rows,
            'message' => 'Pending delivery completion cash transfers retrieved successfully',
        ]);
    }

    public function acceptOutletTransfer(Request $request, string $id): JsonResponse
    {
        if (!Schema::hasTable('outlet_cash_drawer_transfers')) {
            return response()->json([
                'success' => false,
                'message' => 'Outlet transfer table is not available. Please run database migrations.',
            ], 503);
        }

        if (!$this->isAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Only admin users can add pending outlet transfers to main account.',
            ], 403);
        }

        $transferId = (int) $id;
        if ($transferId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid transfer id.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($transferId, $request) {
                $transfer = DB::table('outlet_cash_drawer_transfers')
                    ->where('id', $transferId)
                    ->lockForUpdate()
                    ->first();

                if (!$transfer) {
                    throw new \RuntimeException('Pending outlet transfer not found.');
                }

                if ((string) $transfer->status !== 'pending') {
                    throw new \RuntimeException('This transfer is already processed.');
                }

                $amount = (float) ($transfer->amount ?? 0);
                if ($amount <= 0) {
                    throw new \RuntimeException('Invalid transfer amount.');
                }

                $sessionDate = $transfer->session_date ?: now()->toDateString();
                $breakdown = $this->resolveOutletTransferBreakdown((int) $transfer->outlet_id, (string) $sessionDate);
                $includeCardToBank = $request->has('include_card_collection_to_bank_account')
                    ? $request->boolean('include_card_collection_to_bank_account')
                    : true;
                $includeCashToMainCash = $request->has('include_cash_collection_to_main_cash_account')
                    ? $request->boolean('include_cash_collection_to_main_cash_account')
                    : true;
                $includeStartToMainCash = $request->has('include_start_amount_to_main_cash_account')
                    ? $request->boolean('include_start_amount_to_main_cash_account')
                    : true;
                $cardCollectionBankAccountId = (int) $request->input('card_collection_bank_account_id', 0);

                $cardToBankAmount = $includeCardToBank ? max((float) ($breakdown['card_collection_total'] ?? 0), 0) : 0.0;
                $cashToMainCashAmount = $includeCashToMainCash ? max((float) ($breakdown['cash_collection_total'] ?? 0), 0) : 0.0;
                $startToMainCashAmount = $includeStartToMainCash ? max((float) ($breakdown['start_amount'] ?? 0), 0) : 0.0;
                $selectedTotal = $cardToBankAmount + $cashToMainCashAmount + $startToMainCashAmount;

                if ($selectedTotal <= 0) {
                    throw new \RuntimeException('No amount was selected to post. Choose at least one "Yes" option.');
                }

                $company = Company::query()->orderBy('id')->lockForUpdate()->first();
                if (!$company) {
                    throw new \RuntimeException('No company profile found to receive this transfer.');
                }

                $nextCash = (float) ($company->current_cash_balance ?? 0) + $cashToMainCashAmount + $startToMainCashAmount;
                $nextBank = (float) ($company->current_bank_balance ?? 0) + $cardToBankAmount;
                $company->update([
                    'current_cash_balance' => round($nextCash, 2),
                    'current_bank_balance' => round($nextBank, 2),
                ]);

                $cardBankLabel = 'Bank Account';
                if ($cardToBankAmount > 0) {
                    if ($cardCollectionBankAccountId <= 0) {
                        throw new \RuntimeException('Please select a company bank account for card collection posting.');
                    }

                    $selectedBankAccount = CompanyBankAccount::query()
                        ->where('company_id', (int) $company->id)
                        ->where('id', $cardCollectionBankAccountId)
                        ->lockForUpdate()
                        ->first();

                    if (!$selectedBankAccount) {
                        throw new \RuntimeException('Selected company bank account is invalid for card collection posting.');
                    }

                    $bankName = trim((string) ($selectedBankAccount->bank_name ?? 'Bank'));
                    $accountNo = trim((string) ($selectedBankAccount->account_no ?? '-'));
                    $cardBankLabel = 'Bank - ' . $bankName . ' (A/C: ' . $accountNo . ')';
                    $selectedBankAccount->current_balance = round((float) ($selectedBankAccount->current_balance ?? 0) + $cardToBankAmount, 2);
                    $selectedBankAccount->save();
                }

                $outlet = DB::table('outlets')->where('id', (int) $transfer->outlet_id)->first(['name', 'code']);
                $outletLabel = trim((string) ($outlet->name ?? 'Outlet'));
                $outletCode = trim((string) ($outlet->code ?? ''));

                if ($cardToBankAmount > 0) {
                    MainCashTransaction::create([
                        'date' => $sessionDate,
                        'type' => 'in',
                        'amount' => $cardToBankAmount,
                        'reference' => 'OUTLET-CARD-TRF-' . $transferId,
                        'note' => 'Accepted outlet card collection. Dr ' . $cardBankLabel . ', Cr Outlet Cash Drawer - '
                            . $outletLabel
                            . ($outletCode !== '' ? ' (' . $outletCode . ')' : '')
                            . '.',
                        'created_by' => $request->user()?->id,
                    ]);
                }

                if ($cashToMainCashAmount > 0) {
                    MainCashTransaction::create([
                        'date' => $sessionDate,
                        'type' => 'in',
                        'amount' => $cashToMainCashAmount,
                        'reference' => 'OUTLET-CASH-TRF-' . $transferId,
                        'note' => 'Accepted outlet cash collection. Dr Cash Account, Cr Outlet Cash Drawer - '
                            . $outletLabel
                            . ($outletCode !== '' ? ' (' . $outletCode . ')' : '')
                            . '.',
                        'created_by' => $request->user()?->id,
                    ]);
                }

                if ($startToMainCashAmount > 0) {
                    MainCashTransaction::create([
                        'date' => $sessionDate,
                        'type' => 'in',
                        'amount' => $startToMainCashAmount,
                        'reference' => 'OUTLET-START-TRF-' . $transferId,
                        'note' => 'Accepted outlet start amount transfer. Dr Cash Account, Cr Outlet Cash Drawer - '
                            . $outletLabel
                            . ($outletCode !== '' ? ' (' . $outletCode . ')' : '')
                            . '.',
                        'created_by' => $request->user()?->id,
                    ]);
                }

                DB::table('outlet_cash_drawer_transfers')
                    ->where('id', $transferId)
                    ->update([
                        'status' => 'accepted',
                        'note' => trim((string) ($transfer->note ?? '')) !== ''
                            ? (string) $transfer->note . ' | Accepted into main account. (Card to Bank: '
                                . number_format($cardToBankAmount, 2, '.', '')
                                . ', Cash to Main Cash: '
                                . number_format($cashToMainCashAmount, 2, '.', '')
                                . ', Start to Main Cash: '
                                . number_format($startToMainCashAmount, 2, '.', '')
                                . ')'
                            : 'Accepted into main account. (Card to Bank: '
                                . number_format($cardToBankAmount, 2, '.', '')
                                . ', Cash to Main Cash: '
                                . number_format($cashToMainCashAmount, 2, '.', '')
                                . ', Start to Main Cash: '
                                . number_format($startToMainCashAmount, 2, '.', '')
                                . ')',
                        'updated_at' => now(),
                    ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Pending outlet transfer added to main account successfully.',
        ]);
    }

    public function acceptDeliveryCompletionCashTransfer(Request $request, string $id): JsonResponse
    {
        if (!Schema::hasTable('delivery_completion_cash_transfers')) {
            return response()->json([
                'success' => false,
                'message' => 'Delivery completion cash transfer table is not available. Please run database migrations.',
            ], 503);
        }

        if (!$this->isAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Only admin users can add pending delivery completion cash transfers to main account.',
            ], 403);
        }

        $transferId = (int) $id;
        if ($transferId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid transfer id.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($transferId, $request) {
                $transfer = DB::table('delivery_completion_cash_transfers')
                    ->where('id', $transferId)
                    ->lockForUpdate()
                    ->first();

                if (!$transfer) {
                    throw new \RuntimeException('Pending delivery completion cash transfer not found.');
                }

                if ((string) $transfer->status !== 'pending') {
                    throw new \RuntimeException('This delivery completion cash transfer is already processed.');
                }

                $amount = (float) ($transfer->amount ?? 0);
                if ($amount <= 0) {
                    throw new \RuntimeException('Invalid transfer amount.');
                }

                $company = Company::query()->orderBy('id')->lockForUpdate()->first();
                if (!$company) {
                    throw new \RuntimeException('No company profile found to receive this transfer.');
                }

                $company->update([
                    'current_cash_balance' => round((float) ($company->current_cash_balance ?? 0) + $amount, 2),
                ]);

                $loadNumber = trim((string) ($transfer->load_number ?? ''));
                MainCashTransaction::create([
                    'date' => $transfer->delivery_date ?: now()->toDateString(),
                    'type' => 'in',
                    'amount' => $amount,
                    'reference' => substr('LOAD-DELIVERY-CASH-TRF-' . $transferId, 0, 100),
                    'note' => 'Accepted delivery completion cash transfer. Dr Main Cash Account, Cr Delivery Cash Account.'
                        . ($loadNumber !== '' ? ' Load ' . $loadNumber . '.' : ''),
                    'created_by' => $request->user()?->id,
                ]);

                DB::table('delivery_completion_cash_transfers')
                    ->where('id', $transferId)
                    ->update([
                        'status' => 'accepted',
                        'note' => trim((string) ($transfer->note ?? '')) !== ''
                            ? (string) $transfer->note . ' | Accepted into main account.'
                            : 'Accepted into main account.',
                        'updated_at' => now(),
                    ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Pending delivery completion cash transfer added to main account successfully.',
        ]);
    }

    public function rejectDeliveryCompletionCashTransfer(Request $request, string $id): JsonResponse
    {
        if (!Schema::hasTable('delivery_completion_cash_transfers')) {
            return response()->json([
                'success' => false,
                'message' => 'Delivery completion cash transfer table is not available. Please run database migrations.',
            ], 503);
        }

        if (!$this->isAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Only admin users can reject pending delivery completion cash transfers.',
            ], 403);
        }

        $transferId = (int) $id;
        if ($transferId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid transfer id.',
            ], 422);
        }

        $transfer = DB::table('delivery_completion_cash_transfers')
            ->where('id', $transferId)
            ->where('status', 'pending')
            ->first();

        if (!$transfer) {
            return response()->json([
                'success' => false,
                'message' => 'Pending delivery completion cash transfer not found.',
            ], 404);
        }

        DB::table('delivery_completion_cash_transfers')
            ->where('id', $transferId)
            ->update([
                'status' => 'rejected',
                'note' => trim((string) ($transfer->note ?? '')) !== ''
                    ? (string) $transfer->note . ' | Rejected from main account.'
                    : 'Rejected from main account.',
                'updated_at' => now(),
            ]);

        return response()->json([
            'success' => true,
            'message' => 'Pending delivery completion cash transfer rejected successfully.',
        ]);
    }

    public function rejectOutletTransfer(Request $request, string $id): JsonResponse
    {
        if (!Schema::hasTable('outlet_cash_drawer_transfers')) {
            return response()->json([
                'success' => false,
                'message' => 'Outlet transfer table is not available. Please run database migrations.',
            ], 503);
        }

        if (!$this->isAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Only admin users can reject pending outlet transfers.',
            ], 403);
        }

        $transferId = (int) $id;
        if ($transferId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid transfer id.',
            ], 422);
        }

        $transfer = DB::table('outlet_cash_drawer_transfers')
            ->where('id', $transferId)
            ->where('status', 'pending')
            ->first();

        if (!$transfer) {
            return response()->json([
                'success' => false,
                'message' => 'Pending outlet transfer not found.',
            ], 404);
        }

        DB::table('outlet_cash_drawer_transfers')
            ->where('id', $transferId)
            ->update([
                'status' => 'rejected',
                'note' => trim((string) ($transfer->note ?? '')) !== ''
                    ? (string) $transfer->note . ' | Rejected from main account.'
                    : 'Rejected from main account.',
                'updated_at' => now(),
            ]);

        return response()->json([
            'success' => true,
            'message' => 'Pending outlet transfer rejected successfully.',
        ]);
    }
}
