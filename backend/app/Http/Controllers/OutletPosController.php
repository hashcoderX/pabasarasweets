<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\CompanyBankAccount;
use App\Models\MainCashTransaction;
use App\Models\Outlet;
use App\Models\OutletSale;
use App\Models\OutletSaleItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class OutletPosController extends Controller
{
    private const LOYALTY_POINT_RATE = 0.01; // 1 point per 100 currency units

    private function generateDoNumber(): string
    {
        return 'DO' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 3));
    }

    private function generateOrderNumber(): string
    {
        return 'ORD' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 3));
    }

    private function generateDistributionDoNumber(): string
    {
        return 'DO' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 3));
    }

    private function generateDistributionInvoiceNumber(): string
    {
        return 'INV' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 3));
    }

    private function generateDistributionPaymentNumber(): string
    {
        return 'PAY' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 3));
    }

    private function postInvoicePaymentToMainAccount(
        float $amount,
        string $paymentType,
        ?int $bankAccountId,
        string $invoiceNumber,
        int $customerId,
        ?string $paymentDate,
        ?int $userId
    ): void {
        if ($amount <= 0) {
            return;
        }

        $customer = DB::table('distribution_customers')->where('id', $customerId)->first(['shop_name']);
        $customerName = trim((string) ($customer->shop_name ?? 'Customer'));
        $date = $paymentDate ?: now()->toDateString();
        $accountLabel = 'Cash Account';

        if ($paymentType === 'bank') {
            if (!$bankAccountId) {
                throw new \RuntimeException('A receiving bank account is required for bank transfer payments.');
            }

            $bankAccount = CompanyBankAccount::query()
                ->whereKey($bankAccountId)
                ->lockForUpdate()
                ->first();

            if (!$bankAccount) {
                throw new \RuntimeException('The selected receiving bank account is not available.');
            }

            $bankAccount->update([
                'current_balance' => round((float) ($bankAccount->current_balance ?? 0) + $amount, 2),
            ]);

            $company = Company::query()
                ->whereKey((int) $bankAccount->company_id)
                ->lockForUpdate()
                ->first();

            if (!$company) {
                throw new \RuntimeException('The company linked to the receiving bank account was not found.');
            }

            $company->update([
                'current_bank_balance' => round((float) $company->bankAccounts()->sum('current_balance'), 2),
            ]);
            $accountLabel = 'Bank - ' . trim((string) ($bankAccount->bank_name ?: 'Bank'))
                . ' (A/C: ' . trim((string) ($bankAccount->account_no ?: '-')) . ')';
        } else {
            $company = Company::query()->orderBy('id')->lockForUpdate()->first();
            if (!$company) {
                throw new \RuntimeException('No company profile is available to receive the invoice payment.');
            }

            if ($paymentType === 'cheque') {
                $company->update([
                    'current_cheque_balance' => round((float) ($company->current_cheque_balance ?? 0) + $amount, 2),
                ]);
                $accountLabel = 'Cheque Account';
            } else {
                $company->update([
                    'current_cash_balance' => round((float) ($company->current_cash_balance ?? 0) + $amount, 2),
                ]);
            }
        }

        MainCashTransaction::create([
            'date' => $date,
            'type' => 'in',
            'amount' => $amount,
            'reference' => 'INV-PAY-' . $invoiceNumber,
            'note' => 'Invoice payment received. Dr ' . $accountLabel
                . ', Cr Accounts Receivable - ' . $customerName
                . ' (' . $invoiceNumber . ').',
            'created_by' => $userId,
        ]);
    }

    private function resolveOrderStatus(bool $hasDo, bool $hasInvoice): string
    {
        if ($hasDo && $hasInvoice) return 'completed';
        if ($hasInvoice) return 'invoiced';
        if ($hasDo) return 'do_created';
        return 'accepted';
    }

    /**
     * @param array<int, string> $columns
     * @return array<int, string>
     */
    private function missingOrderColumns(array $columns): array
    {
        if (!Schema::hasTable('orders')) {
            return $columns;
        }

        $missing = [];
        foreach ($columns as $column) {
            if (!Schema::hasColumn('orders', $column)) {
                $missing[] = $column;
            }
        }

        return $missing;
    }

    private function resolveDeliveryEmployeeName(int $deliveryEmployeeId): ?string
    {
        if ($deliveryEmployeeId <= 0 || !Schema::hasTable('employees')) {
            return null;
        }

        $employee = DB::table('employees')
            ->where('id', $deliveryEmployeeId)
            ->select('first_name', 'last_name')
            ->first();

        if (!$employee) {
            return null;
        }

        $firstName = trim((string) ($employee->first_name ?? ''));
        $lastName = trim((string) ($employee->last_name ?? ''));
        return trim($firstName . ' ' . $lastName) ?: null;
    }

    private function hasCashDrawerTables(): bool
    {
        return Schema::hasTable('outlet_cash_drawers') && Schema::hasTable('outlet_cash_drawer_sessions');
    }

    private function hasCashDrawerTransferTable(): bool
    {
        return Schema::hasTable('outlet_cash_drawer_transfers');
    }

    private function upsertCashDrawerBalance(int $outletId, float $balance, ?int $userId, ?string $note): void
    {
        $now = now();

        $existing = DB::table('outlet_cash_drawers')
            ->where('outlet_id', $outletId)
            ->first();

        if ($existing) {
            DB::table('outlet_cash_drawers')
                ->where('outlet_id', $outletId)
                ->update([
                    'balance' => $balance,
                    'last_set_by' => $userId,
                    'last_set_at' => $now,
                    'note' => $note,
                    'updated_at' => $now,
                ]);
            return;
        }

        DB::table('outlet_cash_drawers')->insert([
            'outlet_id' => $outletId,
            'balance' => $balance,
            'last_set_by' => $userId,
            'last_set_at' => $now,
            'note' => $note,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function cashierSessionStatusByOutlet(int $outletId, ?string $sessionDate = null): array
    {
        $date = $sessionDate ?: now()->toDateString();

        if (!Schema::hasTable('outlet_cash_drawer_sessions')) {
            return [
                'session_date' => $date,
                'is_open' => false,
                'is_closed' => false,
                'needs_open' => true,
                'opening_balance' => 0,
                'opening_note' => null,
                'opened_at' => null,
                'closing_balance' => null,
                'closing_note' => null,
                'closed_at' => null,
                'status' => null,
            ];
        }

        $session = DB::table('outlet_cash_drawer_sessions')
            ->where('outlet_id', $outletId)
            ->whereDate('session_date', $date)
            ->first();

        if (!$session) {
            return [
                'session_date' => $date,
                'is_open' => false,
                'is_closed' => false,
                'needs_open' => true,
                'opening_balance' => 0,
                'opening_note' => null,
                'opened_at' => null,
                'closing_balance' => null,
                'closing_note' => null,
                'closed_at' => null,
                'status' => null,
            ];
        }

        $isOpen = (string) $session->status === 'open';
        $isClosed = (string) $session->status === 'closed';

        return [
            'session_date' => (string) $session->session_date,
            'is_open' => $isOpen,
            'is_closed' => $isClosed,
            'needs_open' => !$isOpen && !$isClosed,
            'opening_balance' => (float) ($session->opening_balance ?? 0),
            'opening_note' => $session->opening_note,
            'opened_at' => $session->opened_at,
            'closing_balance' => $session->closing_balance !== null ? (float) $session->closing_balance : null,
            'closing_note' => $session->closing_note,
            'closed_at' => $session->closed_at,
            'status' => (string) $session->status,
        ];
    }

    private function cashDrawerByOutlet(int $outletId): array
    {
        if (!Schema::hasTable('outlet_cash_drawers')) {
            return [
                'outlet_id' => $outletId,
                'balance' => 0,
                'last_set_at' => null,
                'last_set_by' => null,
                'note' => null,
            ];
        }

        $row = DB::table('outlet_cash_drawers')
            ->where('outlet_id', $outletId)
            ->first();

        if (!$row) {
            return [
                'outlet_id' => $outletId,
                'balance' => 0,
                'last_set_at' => null,
                'last_set_by' => null,
                'note' => null,
            ];
        }

        return [
            'outlet_id' => (int) $row->outlet_id,
            'balance' => (float) ($row->balance ?? 0),
            'last_set_at' => $row->last_set_at,
            'last_set_by' => $row->last_set_by ? (int) $row->last_set_by : null,
            'note' => $row->note,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function pendingCashDrawerTransfersByOutlet(int $outletId): array
    {
        if (!$this->hasCashDrawerTransferTable()) {
            return [];
        }

        $rows = DB::table('outlet_cash_drawer_transfers as t')
            ->leftJoin('users as u', 'u.id', '=', 't.requested_by')
            ->where('t.outlet_id', $outletId)
            ->where('t.status', 'pending')
            ->orderByDesc('t.requested_at')
            ->orderByDesc('t.id')
            ->limit(25)
            ->get([
                't.id',
                't.session_date',
                't.amount',
                't.status',
                't.note',
                't.requested_at',
                'u.name as requested_by_name',
            ]);

        $sessionDates = $rows
            ->map(fn ($row) => (string) $row->session_date)
            ->filter()
            ->unique()
            ->values();

        $openingByDate = collect();
        if ($sessionDates->isNotEmpty()) {
            $openingByDate = DB::table('outlet_cash_drawer_sessions')
                ->where('outlet_id', $outletId)
                ->whereIn('session_date', $sessionDates->all())
                ->get(['session_date', 'opening_balance'])
                ->keyBy('session_date');
        }

        $salesSummaryByDate = collect();
        if ($sessionDates->isNotEmpty()) {
            $salesSummaryByDate = OutletSale::query()
                ->where('outlet_id', $outletId)
                ->where(function ($query) use ($sessionDates) {
                    foreach ($sessionDates as $sessionDate) {
                        $query->orWhereDate('sale_date', (string) $sessionDate);
                    }
                })
                ->get(['sale_date', 'total_amount', 'paid_amount', 'payment_type'])
                ->groupBy(static function ($sale) {
                    return Carbon::parse((string) $sale->sale_date)->toDateString();
                })
                ->map(static function ($group) {
                    return (object) [
                        'total_sale' => (float) $group->sum(fn ($sale) => (float) ($sale->total_amount ?? 0)),
                        'cash_collection_total' => (float) $group
                            ->filter(fn ($sale) => strtolower((string) ($sale->payment_type ?? 'cash')) === 'cash')
                            ->sum(fn ($sale) => (float) ($sale->paid_amount ?? 0)),
                        'bank_transfer_total' => (float) $group
                            ->filter(function ($sale) {
                                $type = strtolower((string) ($sale->payment_type ?? 'cash'));
                                return $type === 'bank' || $type === 'bank_transfer';
                            })
                            ->sum(fn ($sale) => (float) ($sale->paid_amount ?? 0)),
                        'card_collection_total' => (float) $group
                            ->filter(fn ($sale) => strtolower((string) ($sale->payment_type ?? 'cash')) === 'card')
                            ->sum(fn ($sale) => (float) ($sale->paid_amount ?? 0)),
                    ];
                });
        }

        return $rows->map(function ($row) use ($openingByDate, $salesSummaryByDate): array {
            $sessionDate = (string) $row->session_date;
            $opening = $openingByDate->get($sessionDate);
            $summary = $salesSummaryByDate->get($sessionDate);

            return [
                'id' => (int) $row->id,
                'session_date' => $sessionDate,
                'amount' => (float) $row->amount,
                'status' => (string) $row->status,
                'note' => $row->note ? (string) $row->note : null,
                'requested_at' => $row->requested_at,
                'requested_by_name' => $row->requested_by_name ? (string) $row->requested_by_name : null,
                'start_amount' => (float) ($opening->opening_balance ?? 0),
                'total_sale' => (float) ($summary->total_sale ?? 0),
                'card_collection_total' => (float) ($summary->card_collection_total ?? 0),
                'bank_transfer_total' => (float) ($summary->bank_transfer_total ?? 0),
                'cash_collection_total' => (float) ($summary->cash_collection_total ?? 0),
            ];
        })->values()->all();
    }

    private function outletDayPaymentSummaryByDate(int $outletId, ?string $sessionDate = null): array
    {
        $date = $sessionDate ?: now()->toDateString();

        $summary = OutletSale::query()
            ->where('outlet_id', $outletId)
            ->whereDate('sale_date', $date)
            ->selectRaw('
                COALESCE(SUM(total_amount), 0) as outlet_total_business,
                COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_type, \'cash\')) = \'cash\' THEN COALESCE(paid_amount, 0) ELSE 0 END), 0) as cash_collection_total,
                COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_type, \'cash\')) IN (\'bank\', \'bank_transfer\') THEN COALESCE(paid_amount, 0) ELSE 0 END), 0) as bank_transfer_total,
                COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_type, \'cash\')) = \'card\' THEN COALESCE(paid_amount, 0) ELSE 0 END), 0) as card_payment_total
            ')
            ->first();

        return [
            'session_date' => $date,
            'outlet_total_business' => (float) ($summary->outlet_total_business ?? 0),
            'cash_collection_total' => (float) ($summary->cash_collection_total ?? 0),
            'bank_transfer_total' => (float) ($summary->bank_transfer_total ?? 0),
            'card_payment_total' => (float) ($summary->card_payment_total ?? 0),
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

    private function isOutletUser($user): bool
    {
        if (!$user) {
            return false;
        }

        $user->loadMissing('roles');

        $roles = $user->roles
            ->pluck('name')
            ->push((string) ($user->role ?? ''))
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter();

        return $roles->contains(fn ($roleName) => str_contains($roleName, 'outlet_user'));
    }

    private function getUserOutlet($user): ?Outlet
    {
        if (!$user) {
            return null;
        }

        return Outlet::where('user_id', $user->id)->where('status', 'active')->first();
    }

    private function accessibleOrderQuery(Request $request)
    {
        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        $query = DB::table('orders as o');

        if (!$admin) {
            if (!$outlet) {
                return null;
            }
            $query->where('o.outlet_id', $outlet->id);
        }

        return $query;
    }

    private function stockByOutlet(int $outletId)
    {
        $transferred = DB::table('stock_transfers')
            ->where('outlet_id', $outletId)
            ->groupBy('inventory_item_id')
            ->selectRaw('inventory_item_id, COALESCE(SUM(quantity),0) as transferred_qty');

        $sold = DB::table('outlet_sale_items as osi')
            ->join('outlet_sales as os', 'os.id', '=', 'osi.outlet_sale_id')
            ->where('os.outlet_id', $outletId)
            ->groupBy('osi.inventory_item_id')
            ->selectRaw('osi.inventory_item_id, COALESCE(SUM(osi.quantity),0) as sold_qty');

        return DB::query()
            ->fromSub($transferred, 'tr')
            ->join('inventory_items as ii', 'tr.inventory_item_id', '=', 'ii.id')
            ->leftJoinSub($sold, 'sd', function ($join) {
                $join->on('sd.inventory_item_id', '=', 'tr.inventory_item_id');
            })
            ->selectRaw('tr.inventory_item_id, ii.name, ii.code, ii.unit, COALESCE(ii.sell_price, ii.unit_price, 0) as sell_price, tr.transferred_qty, COALESCE(sd.sold_qty,0) as sold_qty, (tr.transferred_qty - COALESCE(sd.sold_qty,0)) as available_qty')
            ->orderBy('ii.name')
            ->get();
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json([
                'success' => false,
                'message' => 'No active outlet mapped to this user',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'is_admin' => $admin,
                'is_outlet_user' => $this->isOutletUser($user),
                'outlet' => $outlet,
                'stocks' => $outlet ? $this->stockByOutlet($outlet->id) : [],
                'cash_drawer' => $outlet ? $this->cashDrawerByOutlet($outlet->id) : null,
                'cashier_session' => $outlet ? $this->cashierSessionStatusByOutlet($outlet->id) : null,
            ],
            'message' => 'Outlet POS profile retrieved successfully',
        ]);
    }

    public function setCashDrawerBalance(Request $request): JsonResponse
    {
        if (!Schema::hasTable('outlet_cash_drawers')) {
            return response()->json([
                'success' => false,
                'message' => 'Cash drawer table is not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validator = Validator::make($request->all(), [
            'outlet_id' => 'nullable|exists:outlets,id',
            'balance' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $targetOutletId = $admin
            ? (int) ($payload['outlet_id'] ?? ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Outlet is required to set cash drawer balance',
            ], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $this->upsertCashDrawerBalance($activeOutlet->id, (float) $payload['balance'], $user?->id, $payload['note'] ?? null);

        return response()->json([
            'success' => true,
            'data' => $this->cashDrawerByOutlet($activeOutlet->id),
            'message' => 'Cash drawer balance updated successfully',
        ]);
    }

    public function cashDrawerStatus(Request $request): JsonResponse
    {
        if (!$this->hasCashDrawerTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Cash drawer tables are not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $requestedOutletId = (int) $request->get('outlet_id', 0);
        $targetOutletId = $admin
            ? ($requestedOutletId > 0 ? $requestedOutletId : (int) ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $sessionDate = $request->get('session_date');
        $status = $this->cashierSessionStatusByOutlet($activeOutlet->id, $sessionDate ?: null);

        return response()->json([
            'success' => true,
            'data' => [
                'outlet' => [
                    'id' => $activeOutlet->id,
                    'name' => $activeOutlet->name,
                    'code' => $activeOutlet->code,
                ],
                'cash_drawer' => $this->cashDrawerByOutlet($activeOutlet->id),
                'session' => $status,
                'pending_transfers' => $this->pendingCashDrawerTransfersByOutlet($activeOutlet->id),
                'day_payment_summary' => $this->outletDayPaymentSummaryByDate(
                    $activeOutlet->id,
                    (string) ($status['session_date'] ?? ($sessionDate ?: now()->toDateString()))
                ),
            ],
            'message' => 'Cash drawer status retrieved successfully',
        ]);
    }

    public function openCashDrawer(Request $request): JsonResponse
    {
        if (!$this->hasCashDrawerTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Cash drawer tables are not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validator = Validator::make($request->all(), [
            'outlet_id' => 'nullable|exists:outlets,id',
            'opening_balance' => 'required|numeric|min:0',
            'opening_note' => 'nullable|string|max:255',
            'session_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $targetOutletId = $admin
            ? (int) ($payload['outlet_id'] ?? ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $sessionDate = $payload['session_date'] ?? now()->toDateString();
        $existing = DB::table('outlet_cash_drawer_sessions')
            ->where('outlet_id', $activeOutlet->id)
            ->whereDate('session_date', $sessionDate)
            ->first();

        $message = 'Cashier opened successfully';
        if ($existing) {
            $status = (string) ($existing->status ?? '');
            if ($status === 'open') {
                return response()->json(['success' => false, 'message' => 'Cashier is already open for this date'], 422);
            }

            if ($status === 'closed') {
                $now = now();
                DB::table('outlet_cash_drawer_sessions')
                    ->where('id', $existing->id)
                    ->update([
                        'opening_balance' => (float) $payload['opening_balance'],
                        'opening_note' => $payload['opening_note'] ?? null,
                        'opened_at' => $now,
                        'opened_by' => $user?->id,
                        'closing_balance' => null,
                        'closing_note' => null,
                        'closed_at' => null,
                        'closed_by' => null,
                        'status' => 'open',
                        'updated_at' => $now,
                    ]);

                $this->upsertCashDrawerBalance($activeOutlet->id, (float) $payload['opening_balance'], $user?->id, $payload['opening_note'] ?? null);
                $message = 'Cashier reopened successfully';
            }
        }

        if (!$existing) {
            $now = now();
            DB::table('outlet_cash_drawer_sessions')->insert([
                'outlet_id' => $activeOutlet->id,
                'session_date' => $sessionDate,
                'opening_balance' => (float) $payload['opening_balance'],
                'opened_at' => $now,
                'opened_by' => $user?->id,
                'opening_note' => $payload['opening_note'] ?? null,
                'status' => 'open',
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->upsertCashDrawerBalance($activeOutlet->id, (float) $payload['opening_balance'], $user?->id, $payload['opening_note'] ?? null);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'cash_drawer' => $this->cashDrawerByOutlet($activeOutlet->id),
                'session' => $this->cashierSessionStatusByOutlet($activeOutlet->id, $sessionDate),
            ],
            'message' => $message,
        ]);
    }

    public function closeCashDrawer(Request $request): JsonResponse
    {
        if (!$this->hasCashDrawerTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Cash drawer tables are not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validator = Validator::make($request->all(), [
            'outlet_id' => 'nullable|exists:outlets,id',
            'closing_balance' => 'required|numeric|min:0',
            'closing_note' => 'nullable|string|max:255',
            'transfer_to_main_account' => 'nullable|boolean',
            'session_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $transferToMainAccount = (bool) ($payload['transfer_to_main_account'] ?? false);
        $targetOutletId = $admin
            ? (int) ($payload['outlet_id'] ?? ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $sessionDate = $payload['session_date'] ?? now()->toDateString();
        $session = DB::table('outlet_cash_drawer_sessions')
            ->where('outlet_id', $activeOutlet->id)
            ->whereDate('session_date', $sessionDate)
            ->first();

        if (!$session) {
            return response()->json(['success' => false, 'message' => 'No cashier session found for this date'], 422);
        }

        if ((string) $session->status === 'closed') {
            return response()->json(['success' => false, 'message' => 'Cashier already closed for this date'], 422);
        }

        $now = now();
        DB::table('outlet_cash_drawer_sessions')
            ->where('id', $session->id)
            ->update([
                'closing_balance' => (float) $payload['closing_balance'],
                'closed_at' => $now,
                'closed_by' => $user?->id,
                'closing_note' => $payload['closing_note'] ?? null,
                'status' => 'closed',
                'updated_at' => $now,
            ]);

        $this->upsertCashDrawerBalance($activeOutlet->id, (float) $payload['closing_balance'], $user?->id, $payload['closing_note'] ?? null);

        if ($transferToMainAccount) {
            if (!$this->hasCashDrawerTransferTable()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Outlet transfer table is not available. Please run database migrations.',
                ], 503);
            }

            $transferAmount = (float) $payload['closing_balance'];
            if ($transferAmount <= 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Closing balance must be greater than zero to create a pending transfer.',
                ], 422);
            }

            DB::table('outlet_cash_drawer_transfers')->insert([
                'outlet_id' => $activeOutlet->id,
                'session_id' => $session->id,
                'session_date' => $sessionDate,
                'amount' => $transferAmount,
                'status' => 'pending',
                'requested_at' => $now,
                'requested_by' => $user?->id,
                'note' => 'Pending transfer from outlet closing.',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'cash_drawer' => $this->cashDrawerByOutlet($activeOutlet->id),
                'session' => $this->cashierSessionStatusByOutlet($activeOutlet->id, $sessionDate),
                'pending_transfers' => $this->pendingCashDrawerTransfersByOutlet($activeOutlet->id),
                'day_payment_summary' => $this->outletDayPaymentSummaryByDate($activeOutlet->id, $sessionDate),
            ],
            'message' => 'Cashier closed successfully',
        ]);
    }

    public function cashDrawerBalanceSheet(Request $request): JsonResponse
    {
        if (!$this->hasCashDrawerTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Cash drawer tables are not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $sessionDate = $request->get('session_date', now()->toDateString());
        $requestedOutletId = (int) $request->get('outlet_id', 0);
        $targetOutletId = $admin
            ? ($requestedOutletId > 0 ? $requestedOutletId : (int) ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $session = DB::table('outlet_cash_drawer_sessions')
            ->where('outlet_id', $activeOutlet->id)
            ->whereDate('session_date', $sessionDate)
            ->first();

        $salesTotals = OutletSale::query()
            ->where('outlet_id', $activeOutlet->id)
            ->whereDate('sale_date', $sessionDate)
            ->selectRaw('COUNT(*) as total_sales, COALESCE(SUM(total_amount),0) as total_sales_amount')
            ->first();

        $drawerBalance = (float) ($this->cashDrawerByOutlet($activeOutlet->id)['balance'] ?? 0);
        $openingBalance = $session ? (float) ($session->opening_balance ?? 0) : $drawerBalance;
        $closingBalance = $session && $session->closing_balance !== null
            ? (float) $session->closing_balance
            : $drawerBalance;

        return response()->json([
            'success' => true,
            'data' => [
                'outlet' => [
                    'id' => $activeOutlet->id,
                    'name' => $activeOutlet->name,
                    'code' => $activeOutlet->code,
                ],
                'session_date' => $sessionDate,
                'session' => $this->cashierSessionStatusByOutlet($activeOutlet->id, $sessionDate),
                'opening_balance' => $openingBalance,
                'closing_balance' => $closingBalance,
                'balance_difference' => $closingBalance - $openingBalance,
                'total_sales' => (int) ($salesTotals->total_sales ?? 0),
                'total_sales_amount' => (float) ($salesTotals->total_sales_amount ?? 0),
            ],
            'message' => 'Cash drawer balance sheet retrieved successfully',
        ]);
    }

    public function cashDrawerTransactionRecords(Request $request): JsonResponse
    {
        if (!$this->hasCashDrawerTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Cash drawer tables are not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validator = Validator::make($request->all(), [
            'outlet_id' => 'nullable|exists:outlets,id',
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $targetOutletId = $admin
            ? (int) ($payload['outlet_id'] ?? ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $fromDate = $payload['from_date'] ?? now()->startOfMonth()->toDateString();
        $toDate = $payload['to_date'] ?? now()->toDateString();

        $sessions = DB::table('outlet_cash_drawer_sessions')
            ->where('outlet_id', $activeOutlet->id)
            ->whereDate('session_date', '>=', $fromDate)
            ->whereDate('session_date', '<=', $toDate)
            ->orderBy('session_date')
            ->get();

        $salesByDate = OutletSale::query()
            ->where('outlet_id', $activeOutlet->id)
            ->whereDate('sale_date', '>=', $fromDate)
            ->whereDate('sale_date', '<=', $toDate)
            ->selectRaw('DATE(sale_date) as sale_day, COUNT(*) as total_sales, COALESCE(SUM(total_amount),0) as total_sales_amount')
            ->groupBy(DB::raw('DATE(sale_date)'))
            ->get()
            ->keyBy('sale_day');

        $rows = $sessions->map(function ($session) use ($salesByDate) {
            $saleDay = (string) $session->session_date;
            $salesRow = $salesByDate->get($saleDay);

            $opening = (float) ($session->opening_balance ?? 0);
            $closing = $session->closing_balance !== null ? (float) $session->closing_balance : null;

            return [
                'session_date' => $saleDay,
                'status' => (string) ($session->status ?? ''),
                'opening_balance' => $opening,
                'closing_balance' => $closing,
                'difference' => $closing !== null ? ($closing - $opening) : null,
                'opened_at' => $session->opened_at,
                'closed_at' => $session->closed_at,
                'opening_note' => $session->opening_note,
                'closing_note' => $session->closing_note,
                'total_sales' => (int) ($salesRow->total_sales ?? 0),
                'total_sales_amount' => (float) ($salesRow->total_sales_amount ?? 0),
            ];
        })->values();

        $totals = [
            'days' => $rows->count(),
            'opening_total' => (float) $rows->sum(fn ($r) => (float) ($r['opening_balance'] ?? 0)),
            'closing_total' => (float) $rows->sum(fn ($r) => (float) ($r['closing_balance'] ?? 0)),
            'difference_total' => (float) $rows->sum(fn ($r) => (float) ($r['difference'] ?? 0)),
            'sales_count_total' => (int) $rows->sum(fn ($r) => (int) ($r['total_sales'] ?? 0)),
            'sales_amount_total' => (float) $rows->sum(fn ($r) => (float) ($r['total_sales_amount'] ?? 0)),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'outlet' => [
                    'id' => $activeOutlet->id,
                    'name' => $activeOutlet->name,
                    'code' => $activeOutlet->code,
                ],
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'rows' => $rows,
                'totals' => $totals,
            ],
            'message' => 'Cash drawer transaction records retrieved successfully',
        ]);
    }

    public function loyaltyCustomers(Request $request): JsonResponse
    {
        if (!Schema::hasTable('outlet_loyalty_customers')) {
            return response()->json([
                'success' => false,
                'message' => 'Loyalty customer table is not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $targetOutletId = $admin
            ? (int) $request->get('outlet_id', 0)
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $query = DB::table('outlet_loyalty_customers')
            ->where('outlet_id', $targetOutletId)
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('customer_code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $rows = $query->paginate((int) $request->get('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => $rows,
            'message' => 'Loyalty customers retrieved successfully',
        ]);
    }

    public function storeLoyaltyCustomer(Request $request): JsonResponse
    {
        if (!Schema::hasTable('outlet_loyalty_customers')) {
            return response()->json([
                'success' => false,
                'message' => 'Loyalty customer table is not available. Please run database migrations.',
            ], 503);
        }

        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validator = Validator::make($request->all(), [
            'outlet_id' => 'nullable|exists:outlets,id',
            'name' => 'required|string|max:255',
            'phone' => 'required|string|max:50',
            'email' => 'nullable|email|max:255',
            'birthday' => 'nullable|date',
            'notes' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $targetOutletId = $admin
            ? (int) ($payload['outlet_id'] ?? ($outlet?->id ?? 0))
            : (int) ($outlet?->id ?? 0);

        if ($targetOutletId <= 0) {
            return response()->json(['success' => false, 'message' => 'Outlet is required'], 422);
        }

        $activeOutlet = Outlet::where('id', $targetOutletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        $existingPhone = DB::table('outlet_loyalty_customers')
            ->where('outlet_id', $activeOutlet->id)
            ->where('phone', trim((string) $payload['phone']))
            ->first();

        if ($existingPhone) {
            return response()->json([
                'success' => false,
                'message' => 'A loyalty customer already exists with this phone number',
            ], 422);
        }

        $nextSerial = (int) DB::table('outlet_loyalty_customers')
            ->where('outlet_id', $activeOutlet->id)
            ->count() + 1;

        $customerCode = sprintf('LC-%s-%04d', strtoupper((string) $activeOutlet->code), $nextSerial);
        $now = now();

        $id = DB::table('outlet_loyalty_customers')->insertGetId([
            'outlet_id' => $activeOutlet->id,
            'customer_code' => $customerCode,
            'name' => trim((string) $payload['name']),
            'phone' => trim((string) $payload['phone']),
            'email' => isset($payload['email']) ? trim((string) $payload['email']) : null,
            'birthday' => $payload['birthday'] ?? null,
            'points_balance' => 0,
            'total_visits' => 0,
            'total_spent' => 0,
            'status' => 'active',
            'notes' => $payload['notes'] ?? null,
            'created_by' => $user?->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $customer = DB::table('outlet_loyalty_customers')->where('id', $id)->first();

        return response()->json([
            'success' => true,
            'data' => $customer,
            'message' => 'Loyalty customer created successfully',
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $query = OutletSale::with([
            'outlet:id,name,code',
            'soldByUser:id,name,email',
            'loyaltyCustomer:id,customer_code,name,phone,points_balance',
            'assignedLoad',
            'assignedLoad.route',
            'assignedLoad.vehicle',
            'assignedLoad.driver',
            'items:id,outlet_sale_id,inventory_item_id,item_code,item_name,unit,issue_type,discount_amount,quantity,unit_price,line_total',
        ]);

        if (!$admin && $outlet) {
            $query->where('outlet_id', $outlet->id);
        }

        if ($admin && $request->filled('outlet_id')) {
            $query->where('outlet_id', $request->outlet_id);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('sale_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('sale_date', '<=', $request->to_date);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('sale_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhereHas('outlet', function ($o) use ($search) {
                        $o->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('sale_number')) {
            $query->where('sale_number', 'like', '%' . $request->sale_number . '%');
        }

        if ($request->filled('customer_name')) {
            $query->where('customer_name', 'like', '%' . $request->customer_name . '%');
        }

        if ($request->filled('min_amount')) {
            $query->where('total_amount', '>=', (float) $request->min_amount);
        }

        if ($request->filled('max_amount')) {
            $query->where('total_amount', '<=', (float) $request->max_amount);
        }

        if ($request->filled('load_id') && Schema::hasColumn('outlet_sales', 'load_id')) {
            $query->where('load_id', (int) $request->load_id);
        }

        if ($request->boolean('do_only') && Schema::hasColumn('outlet_sales', 'do_number')) {
            $query->whereNotNull('do_number')
                ->where('do_number', '!=', '');
        }

        if ($request->boolean('orders_only') && Schema::hasTable('orders') && Schema::hasTable('order_items')) {
            $hasDoNumber = Schema::hasColumn('orders', 'do_number');
            $hasInvoiceNumber = Schema::hasColumn('orders', 'invoice_number');
            $hasCustomerId = Schema::hasColumn('orders', 'customer_id');
            $hasRejectedReason = Schema::hasColumn('orders', 'rejected_reason');

            $orderItemsAggregate = DB::table('order_items')
                ->selectRaw('order_id, COALESCE(SUM(quantity),0) as total_quantity, COALESCE(SUM(line_total),0) as total_amount')
                ->groupBy('order_id');

            $orderQuery = DB::table('orders as o')
                ->leftJoin('outlets as out', 'out.id', '=', 'o.outlet_id')
                ->leftJoinSub($orderItemsAggregate, 'oi', function ($join) {
                    $join->on('oi.order_id', '=', 'o.id');
                })
                ->selectRaw(implode(",\n", [
                    'o.id',
                    'o.order_number as sale_number',
                    $hasDoNumber ? 'o.do_number as do_number' : 'NULL as do_number',
                    $hasInvoiceNumber ? 'o.invoice_number as invoice_number' : 'NULL as invoice_number',
                    'o.order_type',
                    'o.status',
                    $hasCustomerId ? 'o.customer_id' : 'NULL as customer_id',
                    $hasRejectedReason ? 'o.rejected_reason' : 'NULL as rejected_reason',
                    'o.order_date as sale_date',
                    'o.customer_name',
                    'COALESCE(oi.total_quantity, o.total_quantity, 0) as total_quantity',
                    'COALESCE(oi.total_amount, o.total_amount, 0) as total_amount',
                    'COALESCE(o.discount_amount, 0) as discount_amount',
                    'COALESCE(o.paid_amount, 0) as paid_amount',
                    "COALESCE(o.payment_type, 'cash') as payment_type",
                    'COALESCE(o.balance_amount, 0) as balance_amount',
                    'o.notes',
                    'out.id as outlet_id',
                    'out.name as outlet_name',
                    'out.code as outlet_code',
                ]));

            if (!$admin && $outlet) {
                $orderQuery->where('o.outlet_id', $outlet->id);
            }

            if ($admin && $request->filled('outlet_id')) {
                $orderQuery->where('o.outlet_id', (int) $request->outlet_id);
            }

            if ($request->filled('from_date')) {
                $orderQuery->whereDate('o.order_date', '>=', $request->from_date);
            }

            if ($request->filled('to_date')) {
                $orderQuery->whereDate('o.order_date', '<=', $request->to_date);
            }

            if ($request->filled('search')) {
                $search = (string) $request->search;
                $orderQuery->where(function ($q) use ($search) {
                    $q->where('o.order_number', 'like', "%{$search}%")
                        ->orWhere('o.customer_name', 'like', "%{$search}%")
                        ->orWhere('out.name', 'like', "%{$search}%")
                        ->orWhere('out.code', 'like', "%{$search}%");
                });
            }

            if ($request->filled('sale_number')) {
                $orderQuery->where('o.order_number', 'like', '%' . $request->sale_number . '%');
            }

            if ($request->filled('customer_name')) {
                $orderQuery->where('o.customer_name', 'like', '%' . $request->customer_name . '%');
            }

            if ($request->filled('min_amount')) {
                $orderQuery->where('o.total_amount', '>=', (float) $request->min_amount);
            }

            if ($request->filled('max_amount')) {
                $orderQuery->where('o.total_amount', '<=', (float) $request->max_amount);
            }

            $sales = $orderQuery
                ->orderByDesc('o.order_date')
                ->orderByDesc('o.id')
                ->paginate($request->get('per_page', 20));

            $orderIds = $sales->getCollection()
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->filter(fn ($id) => $id > 0)
                ->values()
                ->all();

            $orderItemsByOrderId = collect();
            if (!empty($orderIds)) {
                $orderItemsByOrderId = DB::table('order_items')
                    ->whereIn('order_id', $orderIds)
                    ->orderBy('id')
                    ->get([
                        'id',
                        'order_id',
                        'inventory_item_id',
                        'item_code',
                        'item_name',
                        'unit',
                        'issue_type',
                        'discount_amount',
                        'quantity',
                        'unit_price',
                        'line_total',
                    ])
                    ->groupBy('order_id');
            }

            $sales->setCollection(
                $sales->getCollection()->map(function ($row) use ($orderItemsByOrderId) {
                    $items = ($orderItemsByOrderId->get((int) $row->id) ?? collect())
                        ->map(function ($item) {
                            return [
                                'id' => (int) $item->id,
                                'order_id' => (int) $item->order_id,
                                'inventory_item_id' => $item->inventory_item_id ? (int) $item->inventory_item_id : null,
                                'item_code' => (string) ($item->item_code ?? ''),
                                'item_name' => (string) ($item->item_name ?? ''),
                                'unit' => (string) ($item->unit ?? ''),
                                'issue_type' => (string) ($item->issue_type ?? 'retail'),
                                'discount_amount' => (float) ($item->discount_amount ?? 0),
                                'quantity' => (float) ($item->quantity ?? 0),
                                'unit_price' => (float) ($item->unit_price ?? 0),
                                'line_total' => (float) ($item->line_total ?? 0),
                            ];
                        })
                        ->values()
                        ->all();

                    return [
                        'id' => (int) $row->id,
                        'sale_number' => (string) $row->sale_number,
                        'do_number' => $row->do_number,
                        'invoice_number' => $row->invoice_number,
                        'order_type' => (string) ($row->order_type ?? 'outlet_order'),
                        'status' => (string) ($row->status ?? 'pending'),
                        'distribution_customer_id' => $row->customer_id ? (int) $row->customer_id : null,
                        'rejected_reason' => $row->rejected_reason,
                        'sale_date' => $row->sale_date,
                        'customer_name' => $row->customer_name,
                        'total_quantity' => (float) ($row->total_quantity ?? 0),
                        'total_amount' => (float) ($row->total_amount ?? 0),
                        'discount_amount' => (float) ($row->discount_amount ?? 0),
                        'paid_amount' => (float) ($row->paid_amount ?? 0),
                        'payment_type' => (string) ($row->payment_type ?? 'cash'),
                        'balance_amount' => (float) ($row->balance_amount ?? 0),
                        'notes' => $row->notes,
                        'outlet' => [
                            'id' => $row->outlet_id ? (int) $row->outlet_id : null,
                            'name' => $row->outlet_name,
                            'code' => $row->outlet_code,
                        ],
                        'items' => $items,
                    ];
                })
            );

            return response()->json([
                'success' => true,
                'data' => $sales,
                'message' => 'Orders retrieved successfully',
            ]);
        }

        $includeFactoryOrders = $admin
            && $request->boolean('include_factory_orders')
            && Schema::hasTable('orders');

        if ($includeFactoryOrders) {
            $salesRows = $query
                ->orderByDesc('sale_date')
                ->orderByDesc('id')
                ->get()
                ->map(function (OutletSale $sale) {
                    $row = $sale->toArray();
                    $row['order_type'] = 'outlet_order';
                    $row['source'] = 'outlet_sale';
                    return $row;
                });

            $factoryOrderQuery = DB::table('orders as o')
                ->leftJoin('outlets as out', 'out.id', '=', 'o.outlet_id')
                ->select([
                    'o.id',
                    'o.order_number',
                    'o.order_type',
                    'o.status',
                    'o.order_date',
                    'o.customer_name',
                    'o.total_quantity',
                    'o.total_amount',
                    'o.discount_amount',
                    'o.paid_amount',
                    'o.payment_type',
                    'o.balance_amount',
                    'o.notes',
                    'out.id as outlet_id',
                    'out.name as outlet_name',
                    'out.code as outlet_code',
                ])
                ->where('o.order_type', 'factory_order');

            if (!$admin && $outlet) {
                $factoryOrderQuery->where('o.outlet_id', $outlet->id);
            }

            if ($admin && $request->filled('outlet_id')) {
                $factoryOrderQuery->where('o.outlet_id', (int) $request->outlet_id);
            }

            if ($request->filled('from_date')) {
                $factoryOrderQuery->whereDate('o.order_date', '>=', $request->from_date);
            }

            if ($request->filled('to_date')) {
                $factoryOrderQuery->whereDate('o.order_date', '<=', $request->to_date);
            }

            if ($request->filled('search')) {
                $search = (string) $request->search;
                $factoryOrderQuery->where(function ($q) use ($search) {
                    $q->where('o.order_number', 'like', "%{$search}%")
                        ->orWhere('o.customer_name', 'like', "%{$search}%")
                        ->orWhere('out.name', 'like', "%{$search}%")
                        ->orWhere('out.code', 'like', "%{$search}%");
                });
            }

            if ($request->filled('customer_name')) {
                $factoryOrderQuery->where('o.customer_name', 'like', '%' . $request->customer_name . '%');
            }

            if ($request->filled('min_amount')) {
                $factoryOrderQuery->where('o.total_amount', '>=', (float) $request->min_amount);
            }

            if ($request->filled('max_amount')) {
                $factoryOrderQuery->where('o.total_amount', '<=', (float) $request->max_amount);
            }

            $factoryRows = $factoryOrderQuery
                ->orderByDesc('o.order_date')
                ->orderByDesc('o.id')
                ->get()
                ->map(function ($row) {
                    return [
                        'id' => 1000000000 + (int) $row->id,
                        'sale_number' => (string) $row->order_number,
                        'do_number' => null,
                        'order_type' => (string) $row->order_type,
                        'status' => (string) ($row->status ?? 'pending'),
                        'sale_date' => $row->order_date,
                        'customer_name' => $row->customer_name,
                        'total_quantity' => (float) ($row->total_quantity ?? 0),
                        'total_amount' => (float) ($row->total_amount ?? 0),
                        'discount_amount' => (float) ($row->discount_amount ?? 0),
                        'paid_amount' => (float) ($row->paid_amount ?? 0),
                        'payment_type' => (string) ($row->payment_type ?? 'cash'),
                        'balance_amount' => (float) ($row->balance_amount ?? 0),
                        'notes' => $row->notes,
                        'outlet' => [
                            'id' => $row->outlet_id ? (int) $row->outlet_id : null,
                            'name' => $row->outlet_name,
                            'code' => $row->outlet_code,
                        ],
                        'items' => [],
                        'source' => 'factory_order',
                    ];
                });

            $merged = $salesRows
                ->concat($factoryRows)
                ->sortByDesc(function ($row) {
                    $ts = strtotime((string) ($row['sale_date'] ?? ''));
                    return $ts !== false ? $ts : 0;
                })
                ->values();

            $perPage = max((int) $request->get('per_page', 20), 1);
            $page = max((int) $request->get('page', 1), 1);
            $total = $merged->count();
            $offset = ($page - 1) * $perPage;
            $pagedData = $merged->slice($offset, $perPage)->values();
            $lastPage = (int) ceil($total / $perPage);

            $sales = [
                'current_page' => $page,
                'data' => $pagedData,
                'first_page_url' => null,
                'from' => $total > 0 ? ($offset + 1) : null,
                'last_page' => max($lastPage, 1),
                'last_page_url' => null,
                'links' => [],
                'next_page_url' => $page < $lastPage ? true : null,
                'path' => $request->url(),
                'per_page' => $perPage,
                'prev_page_url' => $page > 1 ? true : null,
                'to' => $total > 0 ? min($offset + $perPage, $total) : null,
                'total' => $total,
            ];
        } else {
            $sales = $query->orderByDesc('sale_date')->orderByDesc('id')->paginate($request->get('per_page', 20));
        }

        return response()->json([
            'success' => true,
            'data' => $sales,
            'message' => 'Outlet POS sales retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $admin = $this->isAdmin($user);
        $outlet = $this->getUserOutlet($user);

        if (!$admin && !$outlet) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validator = Validator::make($request->all(), [
            'sale_mode' => 'nullable|in:order,get_order,exact_invoice',
            'order_type' => 'nullable|in:outlet_order,factory_order',
            'outlet_id' => 'nullable|exists:outlets,id',
            'sale_date' => 'nullable|date',
            'customer_name' => 'nullable|string|max:255',
            'distribution_customer_id' => 'nullable|exists:distribution_customers,id',
            'loyalty_customer_id' => 'nullable|exists:outlet_loyalty_customers,id',
            'load_id' => 'nullable|exists:loads,id',
            'delivery_employee_id' => 'nullable|exists:employees,id',
            'discount_amount' => 'nullable|numeric|min:0',
            'paid_amount' => 'nullable|numeric|min:0',
            'payment_type' => 'nullable|in:cash,bank,card,online,voucher,cheque',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'required|exists:inventory_items,id',
            'items.*.quantity' => 'required|numeric|gt:0',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.issue_type' => 'nullable|in:free,sample,retail,wholesale,van_sale',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $saleMode = strtolower((string) ($payload['sale_mode'] ?? 'order'));
        $orderType = strtolower((string) ($payload['order_type'] ?? 'outlet_order'));
        $isOrderMode = $saleMode === 'order';
        $isGetOrderMode = $saleMode === 'get_order';
        $isOrderLikeMode = $isOrderMode || $isGetOrderMode;
        $saleDate = isset($payload['sale_date'])
            ? Carbon::parse((string) $payload['sale_date'])->toDateTimeString()
            : now()->toDateTimeString();
        $outletId = $admin ? (int) ($payload['outlet_id'] ?? 0) : (int) $outlet?->id;

        if ($admin && !$isGetOrderMode && $outletId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Outlet is required for admin sales entry',
            ], 422);
        }

        if ($isGetOrderMode && $outletId <= 0) {
            $activeOutlet = Outlet::query()
                ->where('status', 'active')
                ->orderByRaw("CASE WHEN LOWER(name) LIKE '%factory%' OR LOWER(code) LIKE '%factory%' THEN 0 ELSE 1 END")
                ->orderBy('id')
                ->first();
            $outletId = (int) ($activeOutlet?->id ?? 0);
        }

        $activeOutlet = Outlet::where('id', $outletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json([
                'success' => false,
                'message' => $isGetOrderMode
                    ? 'No active outlet available to create order.'
                    : 'Active outlet not found',
            ], 404);
        }

        if (!$isGetOrderMode && $this->hasCashDrawerTables()) {
            $status = $this->cashierSessionStatusByOutlet($activeOutlet->id);
            if (!$status['is_open']) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cashier is not open. Please open cash drawer first.',
                ], 422);
            }
        }

        try {
            $sale = DB::transaction(function () use ($payload, $activeOutlet, $user, $saleMode, $orderType, $isOrderMode, $isGetOrderMode, $isOrderLikeMode, $saleDate) {
                $salesHasStatus = Schema::hasColumn('outlet_sales', 'status');
                $salesHasDoNumber = Schema::hasColumn('outlet_sales', 'do_number');
                $salesHasLoadId = Schema::hasColumn('outlet_sales', 'load_id');
                $salesHasDeliveryEmployeeId = Schema::hasColumn('outlet_sales', 'delivery_employee_id');
                $salesHasDeliveryEmployeeName = Schema::hasColumn('outlet_sales', 'delivery_employee_name');

                $stock = $this->stockByOutlet($activeOutlet->id)->keyBy('inventory_item_id');
                $inventoryItemMap = DB::table('inventory_items')
                    ->select('id', 'code', 'name', 'unit')
                    ->whereIn('id', collect($payload['items'])->pluck('inventory_item_id')->map(fn ($id) => (int) $id)->all())
                    ->get()
                    ->keyBy('id');
                $loyaltyCustomerId = (int) ($payload['loyalty_customer_id'] ?? 0);
                $distributionCustomerId = (int) ($payload['distribution_customer_id'] ?? 0);
                $loadId = (int) ($payload['load_id'] ?? 0);
                $deliveryEmployeeId = (int) ($payload['delivery_employee_id'] ?? 0);
                $deliveryEmployeeName = $deliveryEmployeeId > 0
                    ? $this->resolveDeliveryEmployeeName($deliveryEmployeeId)
                    : null;
                $loyaltyCustomer = null;

                if ($loyaltyCustomerId > 0) {
                    if (!Schema::hasTable('outlet_loyalty_customers')) {
                        throw new \RuntimeException('Loyalty customer table is not available.');
                    }

                    $loyaltyCustomer = DB::table('outlet_loyalty_customers')
                        ->where('id', $loyaltyCustomerId)
                        ->where('outlet_id', $activeOutlet->id)
                        ->where('status', 'active')
                        ->lockForUpdate()
                        ->first();

                    if (!$loyaltyCustomer) {
                        throw new \RuntimeException('Selected loyalty customer is not valid for this outlet.');
                    }
                }

                if ($isGetOrderMode && $distributionCustomerId <= 0 && !empty($payload['customer_name']) && Schema::hasTable('distribution_customers')) {
                    $matchedCustomer = DB::table('distribution_customers')
                        ->where(function ($q) use ($payload) {
                            $name = trim((string) ($payload['customer_name'] ?? ''));
                            $q->where('shop_name', $name)
                                ->orWhere('owner_name', $name)
                                ->orWhere('customer_code', $name);
                        })
                        ->orderByDesc('id')
                        ->first(['id']);

                    if ($matchedCustomer) {
                        $distributionCustomerId = (int) $matchedCustomer->id;
                    }
                }

                $totalQty = 0;
                $totalAmount = 0;
                $itemsToSave = [];

                foreach ($payload['items'] as $line) {
                    $inventoryItemId = (int) $line['inventory_item_id'];
                    $qty = (float) $line['quantity'];
                    $price = (float) $line['unit_price'];
                    $issueType = (string) ($line['issue_type'] ?? 'retail');
                    $discountAmount = max((float) ($line['discount_amount'] ?? 0), 0);

                    if (in_array($issueType, ['free', 'sample'], true)) {
                        $price = 0;
                    } else {
                        $price = max($price - $discountAmount, 0);
                    }

                    $stockLine = $stock->get($inventoryItemId);
                    $available = $stockLine ? (float) $stockLine->available_qty : 0;

                    if (!$isGetOrderMode && $available < $qty) {
                        throw new \RuntimeException("Insufficient stock for item ID {$inventoryItemId}");
                    }

                    $inventoryItemMeta = $inventoryItemMap->get($inventoryItemId);

                    $lineTotal = $qty * $price;
                    $totalQty += $qty;
                    $totalAmount += $lineTotal;

                    $itemsToSave[] = [
                        'inventory_item_id' => $inventoryItemId,
                        'item_code' => (string) ($stockLine->code ?? $inventoryItemMeta?->code ?? ''),
                        'item_name' => (string) ($stockLine->name ?? $inventoryItemMeta?->name ?? ''),
                        'unit' => (string) ($stockLine->unit ?? $inventoryItemMeta?->unit ?? ''),
                        'issue_type' => $issueType,
                        'discount_amount' => in_array($issueType, ['free', 'sample'], true)
                            ? (float) ($line['unit_price'] ?? 0)
                            : $discountAmount,
                        'quantity' => $qty,
                        'unit_price' => $price,
                        'line_total' => $lineTotal,
                    ];
                }

                $discountAmount = min(max((float) ($payload['discount_amount'] ?? 0), 0), $totalAmount);
                $netTotalAmount = max($totalAmount - $discountAmount, 0);
                $paidAmount = max((float) ($payload['paid_amount'] ?? 0), 0);
                $balanceAmount = max($netTotalAmount - $paidAmount, 0);
                $paymentType = $payload['payment_type'] ?? 'cash';

                if ($balanceAmount > 0 && !$isOrderLikeMode && !$loyaltyCustomer) {
                    throw new \RuntimeException('Credit sale is allowed only for loyalty customers. Please select a loyalty customer.');
                }

                $pointsAwarded = $loyaltyCustomer
                    ? round($netTotalAmount * self::LOYALTY_POINT_RATE, 2)
                    : 0;

                if ($isGetOrderMode) {
                    if (!Schema::hasTable('orders') || !Schema::hasTable('order_items')) {
                        throw new \RuntimeException('Orders table is not available. Please run latest migrations.');
                    }

                    $resolvedOrderType = in_array($orderType, ['outlet_order', 'factory_order'], true)
                        ? $orderType
                        : 'outlet_order';

                    $orderId = DB::table('orders')->insertGetId([
                        'order_number' => $this->generateOrderNumber(),
                        'order_type' => $resolvedOrderType,
                        'status' => 'pending',
                        'outlet_id' => $activeOutlet->id,
                        'customer_id' => $distributionCustomerId > 0 ? $distributionCustomerId : null,
                        'load_id' => $loadId > 0 ? $loadId : null,
                        'do_number' => null,
                        'invoice_number' => null,
                        'created_by' => $user?->id,
                        'order_date' => $saleDate,
                        'customer_name' => $payload['customer_name'] ?? null,
                        'total_quantity' => $totalQty,
                        'total_amount' => $netTotalAmount,
                        'discount_amount' => $discountAmount,
                        'paid_amount' => $paidAmount,
                        'payment_type' => $paymentType,
                        'balance_amount' => $balanceAmount,
                        'notes' => $payload['notes'] ?? null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    foreach ($itemsToSave as $line) {
                        DB::table('order_items')->insert([
                            'order_id' => $orderId,
                            'inventory_item_id' => $line['inventory_item_id'],
                            'item_code' => $line['item_code'],
                            'item_name' => $line['item_name'],
                            'unit' => $line['unit'],
                            'issue_type' => $line['issue_type'],
                            'discount_amount' => $line['discount_amount'],
                            'quantity' => $line['quantity'],
                            'unit_price' => $line['unit_price'],
                            'line_total' => $line['line_total'],
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }

                    $order = DB::table('orders as o')
                        ->leftJoin('outlets as out', 'out.id', '=', 'o.outlet_id')
                        ->where('o.id', $orderId)
                        ->select([
                            'o.id',
                            'o.order_number',
                            'o.order_type',
                            'o.status',
                            'o.customer_id',
                            'o.do_number',
                            'o.invoice_number',
                            'o.order_date',
                            'o.customer_name',
                            'o.total_quantity',
                            'o.total_amount',
                            'o.discount_amount',
                            'o.paid_amount',
                            'o.payment_type',
                            'o.balance_amount',
                            'o.notes',
                            'out.name as outlet_name',
                            'out.code as outlet_code',
                        ])
                        ->first();

                    $orderItems = DB::table('order_items')
                        ->where('order_id', $orderId)
                        ->select([
                            'id',
                            'inventory_item_id',
                            'item_code',
                            'item_name',
                            'unit',
                            'issue_type',
                            'discount_amount',
                            'quantity',
                            'unit_price',
                            'line_total',
                        ])
                        ->get();

                    return [
                        'id' => (int) $order->id,
                        'sale_number' => (string) $order->order_number,
                        'do_number' => null,
                        'invoice_number' => $order->invoice_number,
                        'order_type' => (string) $order->order_type,
                        'status' => (string) ($order->status ?? 'pending'),
                        'distribution_customer_id' => $order->customer_id ? (int) $order->customer_id : null,
                        'sale_date' => $order->order_date,
                        'customer_name' => $order->customer_name,
                        'notes' => $order->notes,
                        'total_quantity' => (float) ($order->total_quantity ?? 0),
                        'total_amount' => (float) ($order->total_amount ?? 0),
                        'discount_amount' => (float) ($order->discount_amount ?? 0),
                        'paid_amount' => (float) ($order->paid_amount ?? 0),
                        'payment_type' => (string) ($order->payment_type ?? 'cash'),
                        'balance_amount' => (float) ($order->balance_amount ?? 0),
                        'loyalty_points_awarded' => 0,
                        'outlet' => [
                            'name' => $order->outlet_name,
                            'code' => $order->outlet_code,
                        ],
                        'items' => $orderItems,
                    ];
                }

                $saleData = [
                    'sale_number' => 'OPS' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 4)),
                    'outlet_id' => $activeOutlet->id,
                    'sold_by' => $user?->id,
                    'sale_date' => $saleDate,
                    'customer_name' => $payload['customer_name'] ?? null,
                    'loyalty_customer_id' => $loyaltyCustomer ? (int) $loyaltyCustomer->id : null,
                    'total_quantity' => $totalQty,
                    'total_amount' => $netTotalAmount,
                    'discount_amount' => $discountAmount,
                    'paid_amount' => $paidAmount,
                    'payment_type' => $paymentType,
                    'balance_amount' => $balanceAmount,
                    'loyalty_points_awarded' => $pointsAwarded,
                    'notes' => $payload['notes'] ?? null,
                ];

                if ($salesHasStatus) {
                    $saleData['status'] = $saleMode === 'exact_invoice'
                        ? 'exact_invoice'
                        : 'ordered';
                }

                if ($salesHasDoNumber) {
                    $saleData['do_number'] = $isOrderMode ? $this->generateDoNumber() : null;
                }

                if ($salesHasLoadId) {
                    $saleData['load_id'] = ($isOrderMode && $loadId > 0) ? $loadId : null;
                }

                if ($salesHasDeliveryEmployeeId) {
                    $saleData['delivery_employee_id'] = $deliveryEmployeeId > 0 ? $deliveryEmployeeId : null;
                }

                if ($salesHasDeliveryEmployeeName) {
                    $saleData['delivery_employee_name'] = $deliveryEmployeeName;
                }

                $sale = OutletSale::create($saleData);

                foreach ($itemsToSave as $line) {
                    $line['outlet_sale_id'] = $sale->id;
                    OutletSaleItem::create($line);
                }

                if (Schema::hasTable('outlet_cash_drawers')) {
                    $cashReceived = $netTotalAmount;

                    if ($cashReceived > 0) {
                        $drawer = DB::table('outlet_cash_drawers')
                            ->where('outlet_id', $activeOutlet->id)
                            ->lockForUpdate()
                            ->first();

                        $now = now();
                        $note = sprintf('%s sale %s (+%.2f)', strtoupper((string) $paymentType), (string) $sale->sale_number, $cashReceived);

                        if ($drawer) {
                            DB::table('outlet_cash_drawers')
                                ->where('outlet_id', $activeOutlet->id)
                                ->update([
                                    'balance' => (float) ($drawer->balance ?? 0) + $cashReceived,
                                    'last_set_by' => $user?->id,
                                    'last_set_at' => $now,
                                    'note' => $note,
                                    'updated_at' => $now,
                                ]);
                        } else {
                            DB::table('outlet_cash_drawers')->insert([
                                'outlet_id' => $activeOutlet->id,
                                'balance' => $cashReceived,
                                'last_set_by' => $user?->id,
                                'last_set_at' => $now,
                                'note' => $note,
                                'created_at' => $now,
                                'updated_at' => $now,
                            ]);
                        }
                    }
                }

                if ($loyaltyCustomer) {
                    DB::table('outlet_loyalty_customers')
                        ->where('id', $loyaltyCustomer->id)
                        ->update([
                            'points_balance' => (float) ($loyaltyCustomer->points_balance ?? 0) + $pointsAwarded,
                            'total_visits' => (int) ($loyaltyCustomer->total_visits ?? 0) + 1,
                            'total_spent' => (float) ($loyaltyCustomer->total_spent ?? 0) + $totalAmount,
                            'updated_at' => now(),
                        ]);
                }

                return $sale->load([
                    'outlet:id,name,code',
                    'soldByUser:id,name,email',
                    'loyaltyCustomer:id,customer_code,name,phone,points_balance',
                    'assignedLoad',
                    'assignedLoad.route',
                    'assignedLoad.vehicle',
                    'assignedLoad.driver',
                    'items:id,outlet_sale_id,inventory_item_id,item_code,item_name,unit,issue_type,discount_amount,quantity,unit_price,line_total',
                ]);
            });

            $successMessage = 'Outlet POS sale recorded successfully';
            if ($isGetOrderMode) {
                $createdOrderType = is_array($sale) ? (string) ($sale['order_type'] ?? $orderType) : $orderType;
                $successMessage = $createdOrderType === 'factory_order'
                    ? 'Factory order recorded successfully'
                    : 'Order recorded successfully';
            }

            return response()->json([
                'success' => true,
                'data' => $sale,
                'message' => $successMessage,
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        } catch (\Exception $e) {
            $failedMessage = $isGetOrderMode ? 'Failed to record order' : 'Failed to record outlet sale';
            return response()->json([
                'success' => false,
                'message' => $failedMessage,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    private function getOrderDetailsById(Request $request, int $orderId): ?array
    {
        $orderQuery = $this->accessibleOrderQuery($request);
        if (!$orderQuery) {
            return null;
        }

        $hasDoNumber = Schema::hasColumn('orders', 'do_number');
        $hasInvoiceNumber = Schema::hasColumn('orders', 'invoice_number');
        $hasCustomerId = Schema::hasColumn('orders', 'customer_id');
        $hasRejectedReason = Schema::hasColumn('orders', 'rejected_reason');

        $order = $orderQuery
            ->leftJoin('outlets as out', 'out.id', '=', 'o.outlet_id')
            ->where('o.id', $orderId)
            ->select([
                'o.id',
                'o.order_number',
                DB::raw($hasDoNumber ? 'o.do_number as do_number' : 'NULL as do_number'),
                DB::raw($hasInvoiceNumber ? 'o.invoice_number as invoice_number' : 'NULL as invoice_number'),
                'o.order_type',
                'o.status',
                DB::raw($hasCustomerId ? 'o.customer_id as customer_id' : 'NULL as customer_id'),
                'o.customer_name',
                'o.order_date',
                'o.total_quantity',
                'o.total_amount',
                'o.discount_amount',
                'o.paid_amount',
                'o.payment_type',
                'o.balance_amount',
                'o.notes',
                DB::raw($hasRejectedReason ? 'o.rejected_reason as rejected_reason' : 'NULL as rejected_reason'),
                'out.id as outlet_id',
                'out.name as outlet_name',
                'out.code as outlet_code',
            ])
            ->first();

        if (!$order) {
            return null;
        }

        $items = DB::table('order_items')
            ->where('order_id', (int) $order->id)
            ->orderBy('id')
            ->get([
                'id',
                'order_id',
                'inventory_item_id',
                'item_code',
                'item_name',
                'unit',
                'issue_type',
                'discount_amount',
                'quantity',
                'unit_price',
                'line_total',
            ])
            ->map(function ($item) {
                return [
                    'id' => (int) $item->id,
                    'order_id' => (int) $item->order_id,
                    'inventory_item_id' => $item->inventory_item_id ? (int) $item->inventory_item_id : null,
                    'item_code' => (string) ($item->item_code ?? ''),
                    'item_name' => (string) ($item->item_name ?? ''),
                    'unit' => (string) ($item->unit ?? ''),
                    'issue_type' => (string) ($item->issue_type ?? 'retail'),
                    'discount_amount' => (float) ($item->discount_amount ?? 0),
                    'quantity' => (float) ($item->quantity ?? 0),
                    'unit_price' => (float) ($item->unit_price ?? 0),
                    'line_total' => (float) ($item->line_total ?? 0),
                ];
            })
            ->values()
            ->all();

        return [
            'id' => (int) $order->id,
            'sale_number' => (string) $order->order_number,
            'do_number' => $order->do_number,
            'invoice_number' => $order->invoice_number,
            'order_type' => (string) ($order->order_type ?? 'outlet_order'),
            'status' => (string) ($order->status ?? 'pending'),
            'distribution_customer_id' => $order->customer_id ? (int) $order->customer_id : null,
            'sale_date' => $order->order_date,
            'customer_name' => $order->customer_name,
            'total_quantity' => (float) ($order->total_quantity ?? 0),
            'total_amount' => (float) ($order->total_amount ?? 0),
            'discount_amount' => (float) ($order->discount_amount ?? 0),
            'paid_amount' => (float) ($order->paid_amount ?? 0),
            'payment_type' => (string) ($order->payment_type ?? 'cash'),
            'balance_amount' => (float) ($order->balance_amount ?? 0),
            'notes' => $order->notes,
            'rejected_reason' => $order->rejected_reason,
            'outlet' => [
                'id' => $order->outlet_id ? (int) $order->outlet_id : null,
                'name' => $order->outlet_name,
                'code' => $order->outlet_code,
            ],
            'items' => $items,
        ];
    }

    public function acceptOrder(Request $request, int $orderId): JsonResponse
    {
        if (!Schema::hasTable('orders')) {
            return response()->json(['success' => false, 'message' => 'Orders table is not available'], 422);
        }

        $orderQuery = $this->accessibleOrderQuery($request);
        if (!$orderQuery) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $userId = $request->user()?->id;
        $hasAcceptedAt = Schema::hasColumn('orders', 'accepted_at');
        $hasRejectedAt = Schema::hasColumn('orders', 'rejected_at');
        $hasRejectedReason = Schema::hasColumn('orders', 'rejected_reason');
        $hasProcessedBy = Schema::hasColumn('orders', 'processed_by');

        try {
            DB::transaction(function () use ($orderQuery, $orderId, $userId, $hasAcceptedAt, $hasRejectedAt, $hasRejectedReason, $hasProcessedBy) {
                $order = $orderQuery->where('o.id', $orderId)->lockForUpdate()->first(['o.id', 'o.status']);
                if (!$order) {
                    throw new \RuntimeException('Order not found.');
                }

                $updateData = [
                    'status' => 'accepted',
                    'updated_at' => now(),
                ];
                if ($hasAcceptedAt) {
                    $updateData['accepted_at'] = now();
                }
                if ($hasRejectedAt) {
                    $updateData['rejected_at'] = null;
                }
                if ($hasRejectedReason) {
                    $updateData['rejected_reason'] = null;
                }
                if ($hasProcessedBy) {
                    $updateData['processed_by'] = $userId;
                }

                DB::table('orders')->where('id', $orderId)->update($updateData);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to accept order'], 500);
        }

        $orderData = $this->getOrderDetailsById($request, $orderId);
        return response()->json([
            'success' => true,
            'data' => $orderData,
            'message' => 'Order accepted successfully',
        ]);
    }

    public function rejectOrder(Request $request, int $orderId): JsonResponse
    {
        if (!Schema::hasTable('orders')) {
            return response()->json(['success' => false, 'message' => 'Orders table is not available'], 422);
        }
        $missingColumns = $this->missingOrderColumns(['do_number', 'invoice_number', 'rejected_at', 'rejected_reason', 'processed_by']);
        if (!empty($missingColumns)) {
            return response()->json([
                'success' => false,
                'message' => 'Orders processing columns missing: ' . implode(', ', $missingColumns) . '. Please run latest order migrations.',
            ], 422);
        }

        $orderQuery = $this->accessibleOrderQuery($request);
        if (!$orderQuery) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validated = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:500',
        ])->validate();

        $userId = $request->user()?->id;

        try {
            DB::transaction(function () use ($orderQuery, $orderId, $validated, $userId) {
                $order = $orderQuery->where('o.id', $orderId)->lockForUpdate()->first(['o.id', 'o.status', 'o.do_number', 'o.invoice_number']);
                if (!$order) {
                    throw new \RuntimeException('Order not found.');
                }
                if ((string) ($order->status ?? '') === 'accepted') {
                    throw new \RuntimeException('Accepted order cannot be rejected.');
                }
                if (!empty($order->do_number) || !empty($order->invoice_number)) {
                    throw new \RuntimeException('Cannot reject an order after DO/Invoice creation.');
                }

                DB::table('orders')->where('id', $orderId)->update([
                    'status' => 'rejected',
                    'rejected_at' => now(),
                    'rejected_reason' => trim((string) ($validated['reason'] ?? '')) ?: null,
                    'processed_by' => $userId,
                    'updated_at' => now(),
                ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to reject order'], 500);
        }

        $orderData = $this->getOrderDetailsById($request, $orderId);
        return response()->json([
            'success' => true,
            'data' => $orderData,
            'message' => 'Order rejected successfully',
        ]);
    }

    public function createDoFromOrder(Request $request, int $orderId): JsonResponse
    {
        if (!Schema::hasTable('orders') || !Schema::hasTable('order_items')) {
            return response()->json(['success' => false, 'message' => 'Orders table is not available'], 422);
        }
        if (!Schema::hasTable('distribution_dos') || !Schema::hasTable('distribution_do_items')) {
            return response()->json(['success' => false, 'message' => 'Distribution DO tables are not available'], 422);
        }

        $orderQuery = $this->accessibleOrderQuery($request);
        if (!$orderQuery) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $validated = Validator::make($request->all(), [
            'allocate_load' => 'nullable|boolean',
            'load_id' => 'nullable|exists:loads,id',
            'delivery_date' => 'nullable|date',
            'call_confirmed' => 'nullable|boolean',
        ])->validate();

        $userId = $request->user()?->id;
        $hasOrderCustomerId = Schema::hasColumn('orders', 'customer_id');
        $hasOrderLoadId = Schema::hasColumn('orders', 'load_id');
        $hasOrderDoNumber = Schema::hasColumn('orders', 'do_number');
        $hasOrderInvoiceNumber = Schema::hasColumn('orders', 'invoice_number');
        $hasOrderAcceptedAt = Schema::hasColumn('orders', 'accepted_at');
        $hasOrderDoCreatedAt = Schema::hasColumn('orders', 'do_created_at');
        $hasOrderProcessedBy = Schema::hasColumn('orders', 'processed_by');
        $hasDoItemsLoadId = Schema::hasColumn('distribution_do_items', 'load_id');
        $hasDoDeliveryDate = Schema::hasColumn('distribution_dos', 'delivery_date');
        $hasDoCallConfirmed = Schema::hasColumn('distribution_dos', 'call_confirmed');

        $createdDistributionDoId = 0;
        $createdDistributionDoNumber = '';

        try {
            DB::transaction(function () use (
                $orderQuery,
                $orderId,
                $validated,
                $userId,
                $hasOrderCustomerId,
                $hasOrderLoadId,
                $hasOrderDoNumber,
                $hasOrderInvoiceNumber,
                $hasOrderAcceptedAt,
                $hasOrderDoCreatedAt,
                $hasOrderProcessedBy,
                $hasDoItemsLoadId,
                $hasDoDeliveryDate,
                $hasDoCallConfirmed,
                &$createdDistributionDoId,
                &$createdDistributionDoNumber
            ) {
                $order = $orderQuery
                    ->where('o.id', $orderId)
                    ->lockForUpdate()
                    ->first([
                        'o.id',
                        'o.order_number',
                        'o.status',
                        DB::raw($hasOrderCustomerId ? 'o.customer_id as customer_id' : 'NULL as customer_id'),
                        DB::raw($hasOrderLoadId ? 'o.load_id as load_id' : 'NULL as load_id'),
                        'o.order_date',
                        'o.customer_name',
                        'o.total_amount',
                        'o.discount_amount',
                        'o.paid_amount',
                        'o.notes',
                        DB::raw($hasOrderDoNumber ? 'o.do_number as do_number' : 'NULL as do_number'),
                        DB::raw($hasOrderInvoiceNumber ? 'o.invoice_number as invoice_number' : 'NULL as invoice_number'),
                    ]);

                if (!$order) {
                    throw new \RuntimeException('Order not found.');
                }

                if ((string) $order->status === 'rejected') {
                    throw new \RuntimeException('Rejected order cannot be converted to DO.');
                }

                $resolvedCustomerId = $order->customer_id ? (int) $order->customer_id : 0;

                if ($resolvedCustomerId <= 0) {
                    $customerName = trim((string) ($order->customer_name ?? ''));
                    if ($customerName !== '' && Schema::hasTable('distribution_customers')) {
                        $matchedCustomer = DB::table('distribution_customers')
                            ->where(function ($q) use ($customerName) {
                                $q->where('shop_name', $customerName)
                                    ->orWhere('customer_code', $customerName);
                            })
                            ->orderBy('id')
                            ->first(['id']);

                        if ($matchedCustomer && !empty($matchedCustomer->id)) {
                            $resolvedCustomerId = (int) $matchedCustomer->id;
                            if ($hasOrderCustomerId) {
                                DB::table('orders')
                                    ->where('id', $orderId)
                                    ->update(['customer_id' => $resolvedCustomerId, 'updated_at' => now()]);
                            }
                        }
                    }
                }

                if ($resolvedCustomerId <= 0) {
                    throw new \RuntimeException('Order has no linked distribution customer. Please select a distribution customer while creating order.');
                }

                if (in_array((string) ($order->status ?? ''), ['do_created', 'completed'], true)) {
                    return;
                }

                if ($hasOrderDoNumber && !empty($order->do_number)) {
                    return;
                }

                $items = DB::table('order_items')
                    ->where('order_id', $orderId)
                    ->orderBy('id')
                    ->get();

                if ($items->isEmpty()) {
                    throw new \RuntimeException('Order has no item lines.');
                }

                $total = (float) ($order->total_amount ?? 0);
                $paid = (float) ($order->paid_amount ?? 0);
                $status = $paid >= $total ? 'paid' : ($paid > 0 ? 'partial' : 'pending');
                $doNumber = $this->generateDistributionDoNumber();
                $doDate = substr((string) $order->order_date, 0, 10) ?: now()->toDateString();
                $deliveryDate = !empty($validated['delivery_date']) ? (string) $validated['delivery_date'] : $doDate;
                $callConfirmed = (bool) ($validated['call_confirmed'] ?? false);
                $allocateLoad = (bool) ($validated['allocate_load'] ?? false);
                $requestedLoadId = (int) ($validated['load_id'] ?? 0);
                $resolvedLoadId = null;
                if ($allocateLoad && $requestedLoadId > 0) {
                    $resolvedLoadId = $requestedLoadId;
                } elseif ($allocateLoad && $requestedLoadId <= 0) {
                    throw new \RuntimeException('Please select a load when load allocation is enabled.');
                }

                if ($resolvedLoadId) {
                    $loadExists = DB::table('loads')->where('id', $resolvedLoadId)->exists();
                    if (!$loadExists) {
                        throw new \RuntimeException('Selected allocation load is not available.');
                    }
                }

                $insufficientItems = [];
                $lockedLoadItemsByCode = [];
                $lockedInventoryById = [];

                foreach ($items as $item) {
                    $requiredQty = (float) ($item->quantity ?? 0);
                    if ($requiredQty <= 0) {
                        continue;
                    }

                    $itemCode = (string) ($item->item_code ?? '');
                    $itemName = (string) ($item->item_name ?? $itemCode);

                    if ($resolvedLoadId) {
                        $loadItem = DB::table('load_items')
                            ->where('load_id', $resolvedLoadId)
                            ->where('product_code', $itemCode)
                            ->lockForUpdate()
                            ->first(['id', 'qty']);

                        $availableQty = (float) ($loadItem->qty ?? 0);
                        if (!$loadItem || $availableQty < $requiredQty) {
                            $insufficientItems[] = "{$itemCode} - {$itemName} (required {$requiredQty}, load has {$availableQty})";
                            continue;
                        }

                        $lockedLoadItemsByCode[$itemCode] = $loadItem;
                        continue;
                    }

                    $inventoryItemId = $item->inventory_item_id ? (int) $item->inventory_item_id : 0;
                    if ($inventoryItemId <= 0) {
                        $insufficientItems[] = "{$itemCode} - {$itemName} (inventory item is not linked)";
                        continue;
                    }

                    $inventory = DB::table('inventory_items')
                        ->where('id', $inventoryItemId)
                        ->lockForUpdate()
                        ->first(['id', 'current_stock']);

                    $availableQty = (float) ($inventory->current_stock ?? 0);
                    if (!$inventory || $availableQty < $requiredQty) {
                        $insufficientItems[] = "{$itemCode} - {$itemName} (required {$requiredQty}, stock has {$availableQty})";
                        continue;
                    }

                    $lockedInventoryById[$inventoryItemId] = $inventory;
                }

                if (!empty($insufficientItems)) {
                    $message = 'Insufficient stock for DO: ' . implode('; ', array_slice($insufficientItems, 0, 5));
                    if (count($insufficientItems) > 5) {
                        $message .= '; ...';
                    }
                    throw new \RuntimeException($message);
                }

                $baseNote = trim((string) ($order->notes ?? '')) ?: ('Created from order #' . $order->order_number);
                $notes = "[ORDER_ID:{$orderId}]\n{$baseNote}";
                $notes .= "\nCall Confirmed: " . ($callConfirmed ? 'YES' : 'NO');
                $notes .= "\nDelivery Date: {$deliveryDate}";

                $doInsertData = [
                    'do_number' => $doNumber,
                    'customer_id' => $resolvedCustomerId,
                    'load_id' => $resolvedLoadId,
                    'do_date' => $doDate,
                    'due_date' => $deliveryDate,
                    'subtotal' => max($total + (float) ($order->discount_amount ?? 0), $total),
                    'discount' => (float) ($order->discount_amount ?? 0),
                    'total' => $total,
                    'paid_amount' => $paid,
                    'status' => $status,
                    'notes' => $notes,
                    'created_by' => $userId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                if ($hasDoDeliveryDate) {
                    $doInsertData['delivery_date'] = $deliveryDate;
                }
                if ($hasDoCallConfirmed) {
                    $doInsertData['call_confirmed'] = $callConfirmed ? 1 : 0;
                }

                $distributionDoId = DB::table('distribution_dos')->insertGetId($doInsertData);

                foreach ($items as $item) {
                    $doItemInsertData = [
                        'distribution_do_id' => $distributionDoId,
                        'inventory_item_id' => $item->inventory_item_id ? (int) $item->inventory_item_id : null,
                        'item_code' => (string) ($item->item_code ?? ''),
                        'item_name' => (string) ($item->item_name ?? ''),
                        'unit' => (string) ($item->unit ?? ''),
                        'quantity' => (float) ($item->quantity ?? 0),
                        'unit_price' => (float) ($item->unit_price ?? 0),
                        'discount' => (float) ($item->discount_amount ?? 0),
                        'line_total' => (float) ($item->line_total ?? 0),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                    if ($hasDoItemsLoadId) {
                        $doItemInsertData['load_id'] = $resolvedLoadId;
                    }
                    DB::table('distribution_do_items')->insert($doItemInsertData);

                    $requiredQty = (float) ($item->quantity ?? 0);
                    $itemCode = (string) ($item->item_code ?? '');
                    if ($resolvedLoadId && isset($lockedLoadItemsByCode[$itemCode])) {
                        DB::table('load_items')
                            ->where('id', (int) $lockedLoadItemsByCode[$itemCode]->id)
                            ->update([
                                'qty' => max(0, (float) $lockedLoadItemsByCode[$itemCode]->qty - $requiredQty),
                                'updated_at' => now(),
                            ]);
                        continue;
                    }

                    $inventoryItemId = $item->inventory_item_id ? (int) $item->inventory_item_id : 0;
                    if ($inventoryItemId > 0 && isset($lockedInventoryById[$inventoryItemId])) {
                        DB::table('inventory_items')
                            ->where('id', $inventoryItemId)
                            ->update([
                                'current_stock' => max(0, (float) $lockedInventoryById[$inventoryItemId]->current_stock - $requiredQty),
                                'updated_at' => now(),
                            ]);
                    }
                }

                $hasInvoice = !empty($order->invoice_number);
                $nextStatus = $this->resolveOrderStatus(true, $hasInvoice);

                $orderUpdateData = [
                    'status' => $nextStatus,
                    'updated_at' => now(),
                ];
                if ($hasOrderDoNumber) {
                    $orderUpdateData['do_number'] = $doNumber;
                }
                if ($hasOrderAcceptedAt) {
                    $orderUpdateData['accepted_at'] = now();
                }
                if ($hasOrderDoCreatedAt) {
                    $orderUpdateData['do_created_at'] = now();
                }
                if ($hasOrderProcessedBy) {
                    $orderUpdateData['processed_by'] = $userId;
                }
                DB::table('orders')->where('id', $orderId)->update($orderUpdateData);

                $createdDistributionDoId = (int) $distributionDoId;
                $createdDistributionDoNumber = $doNumber;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to create DO from order'], 500);
        }

        $orderData = $this->getOrderDetailsById($request, $orderId) ?: [];
        if (is_array($orderData)) {
            $orderData['distribution_do_id'] = $createdDistributionDoId > 0 ? $createdDistributionDoId : null;
            if (empty($orderData['do_number']) && $createdDistributionDoNumber !== '') {
                $orderData['do_number'] = $createdDistributionDoNumber;
            }
        }
        return response()->json([
            'success' => true,
            'data' => $orderData,
            'distribution_do_id' => $createdDistributionDoId > 0 ? $createdDistributionDoId : null,
            'message' => 'DO created successfully from order',
        ]);
    }

    public function createInvoiceFromOrder(Request $request, int $orderId): JsonResponse
    {
        if (!Schema::hasTable('orders') || !Schema::hasTable('order_items')) {
            return response()->json(['success' => false, 'message' => 'Orders table is not available'], 422);
        }
        if (!Schema::hasTable('distribution_invoices') || !Schema::hasTable('distribution_invoice_items')) {
            return response()->json(['success' => false, 'message' => 'Distribution invoice tables are not available'], 422);
        }

        $validator = Validator::make($request->all(), [
            'edit_order' => 'nullable|boolean',
            'order_discount_amount' => 'nullable|numeric|min:0',
            'invoice_paid_amount' => 'nullable|numeric|min:0',
            'invoice_payment_type' => 'nullable|in:cash,bank,card,online,voucher,cheque',
            'invoice_bank_account_id' => 'nullable|integer|exists:company_bank_accounts,id|required_if:invoice_payment_type,bank',
            'invoice_cheque_number' => 'nullable|string|max:100|required_if:invoice_payment_type,cheque',
            'invoice_cheque_date' => 'nullable|date|required_if:invoice_payment_type,cheque',
            'invoice_cheque_bank_name' => 'nullable|string|max:255|required_if:invoice_payment_type,cheque',
            'items' => 'nullable|array|min:1',
            'items.*.id' => 'nullable|integer|min:1',
            'items.*.inventory_item_id' => 'required_with:items|integer|exists:inventory_items,id',
            'items.*.item_code' => 'nullable|string|max:100',
            'items.*.item_name' => 'nullable|string|max:255',
            'items.*.unit' => 'nullable|string|max:100',
            'items.*.quantity' => 'required_with:items|numeric|gt:0',
            'items.*.unit_price' => 'required_with:items|numeric|min:0',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
        ]);
        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }
        $validatedPayload = $validator->validated();
        $shouldEditOrder = (bool) ($validatedPayload['edit_order'] ?? false) && !empty($validatedPayload['items']);
        $editedItemsInput = $shouldEditOrder ? collect($validatedPayload['items']) : collect();
        $orderDiscountOverride = array_key_exists('order_discount_amount', $validatedPayload)
            ? max((float) $validatedPayload['order_discount_amount'], 0)
            : null;
        $invoicePaidAmountOverride = array_key_exists('invoice_paid_amount', $validatedPayload)
            ? max((float) $validatedPayload['invoice_paid_amount'], 0)
            : null;
        $invoicePaymentTypeOverride = $validatedPayload['invoice_payment_type'] ?? null;
        $invoiceBankAccountId = isset($validatedPayload['invoice_bank_account_id'])
            ? (int) $validatedPayload['invoice_bank_account_id']
            : null;
        $invoiceChequeNumber = $validatedPayload['invoice_cheque_number'] ?? null;
        $invoiceChequeDate = $validatedPayload['invoice_cheque_date'] ?? null;
        $invoiceChequeBankName = $validatedPayload['invoice_cheque_bank_name'] ?? null;

        $orderQuery = $this->accessibleOrderQuery($request);
        if (!$orderQuery) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $userId = $request->user()?->id;
        $hasOrderCustomerId = Schema::hasColumn('orders', 'customer_id');
        $hasOrderLoadId = Schema::hasColumn('orders', 'load_id');
        $hasOrderDoNumber = Schema::hasColumn('orders', 'do_number');
        $hasOrderInvoiceNumber = Schema::hasColumn('orders', 'invoice_number');
        $hasOrderAcceptedAt = Schema::hasColumn('orders', 'accepted_at');
        $hasOrderInvoiceCreatedAt = Schema::hasColumn('orders', 'invoice_created_at');
        $hasOrderProcessedBy = Schema::hasColumn('orders', 'processed_by');
        $hasOrderPaidAmount = Schema::hasColumn('orders', 'paid_amount');
        $hasOrderPaymentType = Schema::hasColumn('orders', 'payment_type');
        $hasOrderTotalQuantity = Schema::hasColumn('orders', 'total_quantity');
        $hasOrderTotalAmount = Schema::hasColumn('orders', 'total_amount');
        $hasOrderDiscountAmount = Schema::hasColumn('orders', 'discount_amount');
        $hasOrderBalanceAmount = Schema::hasColumn('orders', 'balance_amount');
        $hasInvoicePaymentType = Schema::hasColumn('distribution_invoices', 'payment_type');
        $hasInvoiceBankAccountId = Schema::hasColumn('distribution_invoices', 'company_bank_account_id');
        $hasInvoiceChequeNumber = Schema::hasColumn('distribution_invoices', 'cheque_number');
        $hasInvoiceChequeDate = Schema::hasColumn('distribution_invoices', 'cheque_date');
        $hasInvoiceChequeBankName = Schema::hasColumn('distribution_invoices', 'cheque_bank_name');
        $hasInvoiceLoadId = Schema::hasColumn('distribution_invoices', 'load_id');
        $hasInvoiceItemsLoadId = Schema::hasColumn('distribution_invoice_items', 'load_id');
        $hasInvoiceItemsDiscount = Schema::hasColumn('distribution_invoice_items', 'discount');
        $hasDistributionPaymentsTable = Schema::hasTable('distribution_payments');
        $hasDistributionPaymentLoadId = $hasDistributionPaymentsTable && Schema::hasColumn('distribution_payments', 'load_id');
        $hasDistributionPaymentChequeDate = $hasDistributionPaymentsTable && Schema::hasColumn('distribution_payments', 'cheque_date');
        $createdDistributionInvoiceId = 0;
        $createdDistributionInvoiceNumber = '';

        try {
            DB::transaction(function () use (
                $orderQuery,
                $orderId,
                $userId,
                $hasOrderCustomerId,
                $hasOrderLoadId,
                $hasOrderDoNumber,
                $hasOrderInvoiceNumber,
                $hasOrderAcceptedAt,
                $hasOrderInvoiceCreatedAt,
                $hasOrderProcessedBy,
                $hasOrderPaidAmount,
                $hasOrderPaymentType,
                $hasOrderTotalQuantity,
                $hasOrderTotalAmount,
                $hasOrderDiscountAmount,
                $hasOrderBalanceAmount,
                $hasInvoiceLoadId,
                $hasInvoiceItemsLoadId,
                $hasInvoiceItemsDiscount,
                $shouldEditOrder,
                $editedItemsInput,
                $orderDiscountOverride,
                $invoicePaidAmountOverride,
                $invoicePaymentTypeOverride,
                $invoiceBankAccountId,
                $invoiceChequeNumber,
                $invoiceChequeDate,
                $invoiceChequeBankName,
                $hasInvoicePaymentType,
                $hasInvoiceBankAccountId,
                $hasInvoiceChequeNumber,
                $hasInvoiceChequeDate,
                $hasInvoiceChequeBankName,
                $hasDistributionPaymentsTable,
                $hasDistributionPaymentLoadId,
                $hasDistributionPaymentChequeDate,
                &$createdDistributionInvoiceId,
                &$createdDistributionInvoiceNumber
            ) {
                $order = $orderQuery
                    ->where('o.id', $orderId)
                    ->lockForUpdate()
                    ->first([
                        'o.id',
                        'o.order_number',
                        'o.status',
                        DB::raw($hasOrderCustomerId ? 'o.customer_id as customer_id' : 'NULL as customer_id'),
                        DB::raw($hasOrderLoadId ? 'o.load_id as load_id' : 'NULL as load_id'),
                        'o.order_date',
                        'o.customer_name',
                        'o.total_amount',
                        'o.discount_amount',
                        'o.paid_amount',
                        'o.notes',
                        DB::raw($hasOrderDoNumber ? 'o.do_number as do_number' : 'NULL as do_number'),
                        DB::raw($hasOrderInvoiceNumber ? 'o.invoice_number as invoice_number' : 'NULL as invoice_number'),
                    ]);

                if (!$order) {
                    throw new \RuntimeException('Order not found.');
                }

                if ((string) $order->status === 'rejected') {
                    throw new \RuntimeException('Rejected order cannot be converted to invoice.');
                }

                $resolvedCustomerId = $order->customer_id ? (int) $order->customer_id : 0;
                if ($resolvedCustomerId <= 0) {
                    $customerName = trim((string) ($order->customer_name ?? ''));
                    if ($customerName !== '' && Schema::hasTable('distribution_customers')) {
                        $matchedCustomer = DB::table('distribution_customers')
                            ->where(function ($q) use ($customerName) {
                                $q->where('shop_name', $customerName)
                                    ->orWhere('customer_code', $customerName);
                            })
                            ->orderBy('id')
                            ->first(['id']);

                        if ($matchedCustomer && !empty($matchedCustomer->id)) {
                            $resolvedCustomerId = (int) $matchedCustomer->id;
                            if ($hasOrderCustomerId) {
                                DB::table('orders')
                                    ->where('id', $orderId)
                                    ->update(['customer_id' => $resolvedCustomerId, 'updated_at' => now()]);
                            }
                        }
                    }
                }

                if ($resolvedCustomerId <= 0) {
                    throw new \RuntimeException('Order has no linked distribution customer. Please select a distribution customer while creating order.');
                }

                if (in_array((string) ($order->status ?? ''), ['invoiced', 'completed'], true)) {
                    return;
                }

                if ($hasOrderInvoiceNumber && !empty($order->invoice_number)) {
                    return;
                }

                $items = DB::table('order_items')
                    ->where('order_id', $orderId)
                    ->orderBy('id')
                    ->get();

                if ($shouldEditOrder) {
                    $inventoryMetaById = DB::table('inventory_items')
                        ->whereIn('id', $editedItemsInput->pluck('inventory_item_id')->map(fn ($id) => (int) $id)->all())
                        ->get(['id', 'code', 'name', 'unit'])
                        ->keyBy('id');

                    $items = $editedItemsInput->map(function ($item) use ($inventoryMetaById) {
                        $inventoryItemId = (int) ($item['inventory_item_id'] ?? 0);
                        $meta = $inventoryMetaById->get($inventoryItemId);
                        $qty = max((float) ($item['quantity'] ?? 0), 0);
                        $unitPrice = max((float) ($item['unit_price'] ?? 0), 0);
                        $discount = max((float) ($item['discount_amount'] ?? 0), 0);
                        $effectiveUnitPrice = max($unitPrice - $discount, 0);

                        return (object) [
                            'id' => isset($item['id']) ? (int) $item['id'] : null,
                            'inventory_item_id' => $inventoryItemId,
                            'item_code' => (string) ($item['item_code'] ?? ($meta->code ?? '')),
                            'item_name' => (string) ($item['item_name'] ?? ($meta->name ?? '')),
                            'unit' => (string) ($item['unit'] ?? ($meta->unit ?? '')),
                            'issue_type' => 'retail',
                            'quantity' => $qty,
                            'unit_price' => $effectiveUnitPrice,
                            'discount_amount' => $discount,
                            'line_total' => $qty * $effectiveUnitPrice,
                        ];
                    })->values();
                }

                if ($items->isEmpty()) {
                    throw new \RuntimeException('Order has no item lines.');
                }

                $resolvedLoadId = $order->load_id ? (int) $order->load_id : null;
                $insufficientItems = [];
                $lockedLoadItemsByCode = [];
                $lockedInventoryById = [];

                foreach ($items as $item) {
                    $requiredQty = (float) ($item->quantity ?? 0);
                    if ($requiredQty <= 0) {
                        continue;
                    }

                    $itemCode = (string) ($item->item_code ?? '');
                    $itemName = (string) ($item->item_name ?? $itemCode);

                    if ($resolvedLoadId) {
                        $loadItem = DB::table('load_items')
                            ->where('load_id', $resolvedLoadId)
                            ->where('product_code', $itemCode)
                            ->lockForUpdate()
                            ->first(['id', 'qty']);

                        $availableQty = (float) ($loadItem->qty ?? 0);
                        if (!$loadItem || $availableQty < $requiredQty) {
                            $insufficientItems[] = "{$itemCode} - {$itemName} (required {$requiredQty}, load has {$availableQty})";
                            continue;
                        }
                        $lockedLoadItemsByCode[$itemCode] = $loadItem;
                        continue;
                    }

                    $inventoryItemId = $item->inventory_item_id ? (int) $item->inventory_item_id : 0;
                    if ($inventoryItemId <= 0) {
                        $insufficientItems[] = "{$itemCode} - {$itemName} (inventory item is not linked)";
                        continue;
                    }

                    $inventory = DB::table('inventory_items')
                        ->where('id', $inventoryItemId)
                        ->lockForUpdate()
                        ->first(['id', 'current_stock']);

                    $availableQty = (float) ($inventory->current_stock ?? 0);
                    if (!$inventory || $availableQty < $requiredQty) {
                        $insufficientItems[] = "{$itemCode} - {$itemName} (required {$requiredQty}, stock has {$availableQty})";
                        continue;
                    }
                    $lockedInventoryById[$inventoryItemId] = $inventory;
                }

                if (!empty($insufficientItems)) {
                    $message = 'Insufficient stock for invoice: ' . implode('; ', array_slice($insufficientItems, 0, 5));
                    if (count($insufficientItems) > 5) {
                        $message .= '; ...';
                    }
                    throw new \RuntimeException($message);
                }

                $itemsSubtotal = (float) $items->sum(fn ($item) => (float) ($item->line_total ?? ((float) ($item->quantity ?? 0) * (float) ($item->unit_price ?? 0))));
                $calculatedOrderDiscount = min(
                    max($orderDiscountOverride ?? (float) ($order->discount_amount ?? 0), 0),
                    $itemsSubtotal
                );
                $totalQty = (float) $items->sum(fn ($item) => (float) ($item->quantity ?? 0));
                $total = max($itemsSubtotal - $calculatedOrderDiscount, 0);
                $paid = $invoicePaidAmountOverride !== null
                    ? $invoicePaidAmountOverride
                    : (float) ($order->paid_amount ?? 0);
                $status = $paid >= $total ? 'paid' : ($paid > 0 ? 'partial' : 'pending');
                $invoiceNumber = $this->generateDistributionInvoiceNumber();
                $invoiceDate = substr((string) $order->order_date, 0, 10) ?: now()->toDateString();
                $resolvedPaymentType = $invoicePaymentTypeOverride
                    ? (string) $invoicePaymentTypeOverride
                    : (string) ($order->payment_type ?? 'cash');

                if ($resolvedPaymentType === 'bank' && !$invoiceBankAccountId) {
                    throw new \RuntimeException('A receiving bank account is required for bank transfer payments.');
                }
                if (
                    $resolvedPaymentType === 'cheque'
                    && (trim((string) $invoiceChequeNumber) === '' || !$invoiceChequeDate || trim((string) $invoiceChequeBankName) === '')
                ) {
                    throw new \RuntimeException('Cheque number, cheque date, and cheque bank are required.');
                }

                $invoiceInsertData = [
                    'invoice_number' => $invoiceNumber,
                    'customer_id' => $resolvedCustomerId,
                    'invoice_date' => $invoiceDate,
                    'due_date' => $invoiceDate,
                    'subtotal' => $itemsSubtotal,
                    'discount' => $calculatedOrderDiscount,
                    'total' => $total,
                    'paid_amount' => $paid,
                    'status' => $status,
                    'notes' => trim((string) ($order->notes ?? '')) ?: ('Created from order #' . $order->order_number),
                    'created_by' => $userId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                if ($hasInvoiceLoadId) {
                    $invoiceInsertData['load_id'] = $resolvedLoadId;
                }
                if ($hasInvoicePaymentType) {
                    $invoiceInsertData['payment_type'] = $resolvedPaymentType;
                }
                if ($hasInvoiceBankAccountId) {
                    $invoiceInsertData['company_bank_account_id'] = $resolvedPaymentType === 'bank' ? $invoiceBankAccountId : null;
                }
                if ($hasInvoiceChequeNumber) {
                    $invoiceInsertData['cheque_number'] = $resolvedPaymentType === 'cheque' ? $invoiceChequeNumber : null;
                }
                if ($hasInvoiceChequeDate) {
                    $invoiceInsertData['cheque_date'] = $resolvedPaymentType === 'cheque' ? $invoiceChequeDate : null;
                }
                if ($hasInvoiceChequeBankName) {
                    $invoiceInsertData['cheque_bank_name'] = $resolvedPaymentType === 'cheque' ? $invoiceChequeBankName : null;
                }

                $invoiceId = DB::table('distribution_invoices')->insertGetId($invoiceInsertData);

                if ($paid > 0 && $hasDistributionPaymentsTable) {
                    $paymentMethod = 'cash';
                    if ($resolvedPaymentType === 'bank') {
                        $paymentMethod = 'bank_transfer';
                    } elseif ($resolvedPaymentType === 'cheque') {
                        $paymentMethod = 'check';
                    } elseif (in_array($resolvedPaymentType, ['card', 'online'], true)) {
                        $paymentMethod = 'bank_transfer';
                    }

                    $paymentReference = null;
                    $paymentBankName = null;
                    if ($paymentMethod === 'check') {
                        $paymentReference = trim((string) $invoiceChequeNumber) ?: null;
                        $paymentBankName = trim((string) $invoiceChequeBankName) ?: null;
                    } elseif ($paymentMethod === 'bank_transfer' && $invoiceBankAccountId) {
                        $bankAccount = CompanyBankAccount::query()
                            ->whereKey((int) $invoiceBankAccountId)
                            ->first(['bank_name', 'account_no']);
                        $paymentReference = trim((string) ($bankAccount->account_no ?? '')) ?: null;
                        $paymentBankName = trim((string) ($bankAccount->bank_name ?? '')) ?: null;
                    }

                    $paymentNumber = $this->generateDistributionPaymentNumber();
                    $attempt = 0;
                    while (
                        DB::table('distribution_payments')->where('payment_number', $paymentNumber)->exists()
                        && $attempt < 3
                    ) {
                        $paymentNumber = $this->generateDistributionPaymentNumber();
                        $attempt++;
                    }

                    $paymentInsertData = [
                        'payment_number' => $paymentNumber,
                        'distribution_invoice_id' => $invoiceId,
                        'customer_id' => $resolvedCustomerId,
                        'payment_date' => $invoiceDate,
                        'amount' => $paid,
                        'payment_method' => $paymentMethod,
                        'reference_no' => $paymentReference,
                        'bank_name' => $paymentBankName,
                        'status' => 'received',
                        'notes' => 'Auto recorded from order invoice ' . $invoiceNumber,
                        'received_by' => $userId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];

                    if ($hasDistributionPaymentLoadId) {
                        $paymentInsertData['load_id'] = $resolvedLoadId;
                    }
                    if ($hasDistributionPaymentChequeDate) {
                        $paymentInsertData['cheque_date'] = $paymentMethod === 'check' ? $invoiceChequeDate : null;
                    }

                    DB::table('distribution_payments')->insert($paymentInsertData);
                }

                $this->postInvoicePaymentToMainAccount(
                    $paid,
                    $resolvedPaymentType,
                    $resolvedPaymentType === 'bank' ? $invoiceBankAccountId : null,
                    $invoiceNumber,
                    $resolvedCustomerId,
                    $invoiceDate,
                    $userId
                );

                foreach ($items as $item) {
                    $itemData = [
                        'distribution_invoice_id' => $invoiceId,
                        'inventory_item_id' => $item->inventory_item_id ? (int) $item->inventory_item_id : null,
                        'item_code' => (string) ($item->item_code ?? ''),
                        'item_name' => (string) ($item->item_name ?? ''),
                        'unit' => (string) ($item->unit ?? ''),
                        'quantity' => (float) ($item->quantity ?? 0),
                        'unit_price' => (float) ($item->unit_price ?? 0),
                        'line_total' => (float) ($item->line_total ?? 0),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                    if ($hasInvoiceItemsDiscount) {
                        $itemData['discount'] = (float) ($item->discount_amount ?? 0);
                    }
                    if ($hasInvoiceItemsLoadId) {
                        $itemData['load_id'] = $resolvedLoadId;
                    }
                    DB::table('distribution_invoice_items')->insert($itemData);

                    $requiredQty = (float) ($item->quantity ?? 0);
                    $itemCode = (string) ($item->item_code ?? '');
                    if ($resolvedLoadId && isset($lockedLoadItemsByCode[$itemCode])) {
                        DB::table('load_items')
                            ->where('id', (int) $lockedLoadItemsByCode[$itemCode]->id)
                            ->update([
                                'qty' => max(0, (float) $lockedLoadItemsByCode[$itemCode]->qty - $requiredQty),
                                'updated_at' => now(),
                            ]);
                        continue;
                    }

                    $inventoryItemId = $item->inventory_item_id ? (int) $item->inventory_item_id : 0;
                    if ($inventoryItemId > 0 && isset($lockedInventoryById[$inventoryItemId])) {
                        DB::table('inventory_items')
                            ->where('id', $inventoryItemId)
                            ->update([
                                'current_stock' => max(0, (float) $lockedInventoryById[$inventoryItemId]->current_stock - $requiredQty),
                                'updated_at' => now(),
                            ]);
                    }
                }

                if ($shouldEditOrder) {
                    DB::table('order_items')->where('order_id', $orderId)->delete();
                    foreach ($items as $item) {
                        DB::table('order_items')->insert([
                            'order_id' => $orderId,
                            'inventory_item_id' => $item->inventory_item_id ? (int) $item->inventory_item_id : null,
                            'item_code' => (string) ($item->item_code ?? ''),
                            'item_name' => (string) ($item->item_name ?? ''),
                            'unit' => (string) ($item->unit ?? ''),
                            'issue_type' => (string) ($item->issue_type ?? 'retail'),
                            'discount_amount' => (float) ($item->discount_amount ?? 0),
                            'quantity' => (float) ($item->quantity ?? 0),
                            'unit_price' => (float) ($item->unit_price ?? 0),
                            'line_total' => (float) ($item->line_total ?? 0),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                }

                $hasDo = !empty($order->do_number);
                $nextStatus = $this->resolveOrderStatus($hasDo, true);

                $orderUpdateData = [
                    'status' => $nextStatus,
                    'updated_at' => now(),
                ];
                if ($hasOrderInvoiceNumber) {
                    $orderUpdateData['invoice_number'] = $invoiceNumber;
                }
                if ($hasOrderAcceptedAt) {
                    $orderUpdateData['accepted_at'] = now();
                }
                if ($hasOrderInvoiceCreatedAt) {
                    $orderUpdateData['invoice_created_at'] = now();
                }
                if ($hasOrderProcessedBy) {
                    $orderUpdateData['processed_by'] = $userId;
                }
                if ($hasOrderPaidAmount) {
                    $orderUpdateData['paid_amount'] = $paid;
                }
                if ($hasOrderPaymentType) {
                    $orderUpdateData['payment_type'] = $resolvedPaymentType;
                }
                if ($hasOrderTotalQuantity) {
                    $orderUpdateData['total_quantity'] = $totalQty;
                }
                if ($hasOrderTotalAmount) {
                    $orderUpdateData['total_amount'] = $total;
                }
                if ($hasOrderDiscountAmount) {
                    $orderUpdateData['discount_amount'] = $calculatedOrderDiscount;
                }
                if ($hasOrderBalanceAmount) {
                    $orderUpdateData['balance_amount'] = max($total - $paid, 0);
                }
                DB::table('orders')->where('id', $orderId)->update($orderUpdateData);

                $createdDistributionInvoiceId = (int) $invoiceId;
                $createdDistributionInvoiceNumber = $invoiceNumber;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to create invoice from order'], 500);
        }

        $orderData = $this->getOrderDetailsById($request, $orderId) ?: [];
        if (is_array($orderData)) {
            $orderData['distribution_invoice_id'] = $createdDistributionInvoiceId > 0 ? $createdDistributionInvoiceId : null;
            if (empty($orderData['invoice_number']) && $createdDistributionInvoiceNumber !== '') {
                $orderData['invoice_number'] = $createdDistributionInvoiceNumber;
            }
        }
        return response()->json([
            'success' => true,
            'data' => $orderData,
            'distribution_invoice_id' => $createdDistributionInvoiceId > 0 ? $createdDistributionInvoiceId : null,
            'message' => 'Invoice created successfully from order',
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$this->isAdmin($user)) {
            return response()->json(['success' => false, 'message' => 'Admin access required'], 403);
        }

        $summaryQuery = OutletSale::query()
            ->join('outlets', 'outlet_sales.outlet_id', '=', 'outlets.id')
            ->selectRaw('outlet_sales.outlet_id, outlets.name as outlet_name, outlets.code as outlet_code, COUNT(outlet_sales.id) as total_sales, COALESCE(SUM(outlet_sales.total_quantity),0) as total_quantity, COALESCE(SUM(outlet_sales.total_amount),0) as total_amount')
            ->groupBy('outlet_sales.outlet_id', 'outlets.name', 'outlets.code');

        if ($request->filled('from_date')) {
            $summaryQuery->whereDate('outlet_sales.sale_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $summaryQuery->whereDate('outlet_sales.sale_date', '<=', $request->to_date);
        }

        $summary = $summaryQuery->orderByDesc('total_amount')->get();

        return response()->json([
            'success' => true,
            'data' => $summary,
            'message' => 'Outlet sales summary retrieved successfully',
        ]);
    }

    public function outletSalesReport(Request $request, string $outletId): JsonResponse
    {
        $user = $request->user();
        $admin = $this->isAdmin($user);
        $userOutlet = $this->getUserOutlet($user);

        $outlet = Outlet::find($outletId);
        if (!$outlet) {
            return response()->json(['success' => false, 'message' => 'Outlet not found'], 404);
        }

        if (!$admin && (!$userOutlet || (int) $userOutlet->id !== (int) $outlet->id)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $baseQuery = OutletSale::query()->where('outlet_id', $outlet->id);

        if ($request->filled('from_date')) {
            $baseQuery->whereDate('sale_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $baseQuery->whereDate('sale_date', '<=', $request->to_date);
        }

        $totals = (clone $baseQuery)
            ->selectRaw('COUNT(*) as total_sales, COALESCE(SUM(total_quantity),0) as total_quantity, COALESCE(SUM(total_amount),0) as total_amount')
            ->first();

        $sales = (clone $baseQuery)
            ->with([
                'soldByUser:id,name,email',
                'items:id,outlet_sale_id,inventory_item_id,item_code,item_name,unit,issue_type,discount_amount,quantity,unit_price,line_total',
            ])
            ->orderByDesc('sale_date')
            ->orderByDesc('id')
            ->limit((int) $request->get('limit', 100))
            ->get();

        $itemWiseQuery = OutletSaleItem::query()
            ->join('outlet_sales', 'outlet_sales.id', '=', 'outlet_sale_items.outlet_sale_id')
            ->where('outlet_sales.outlet_id', $outlet->id);

        if ($request->filled('from_date')) {
            $itemWiseQuery->whereDate('outlet_sales.sale_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $itemWiseQuery->whereDate('outlet_sales.sale_date', '<=', $request->to_date);
        }

        $itemWise = $itemWiseQuery
            ->groupBy('outlet_sale_items.inventory_item_id', 'outlet_sale_items.item_code', 'outlet_sale_items.item_name', 'outlet_sale_items.unit')
            ->selectRaw('outlet_sale_items.inventory_item_id, outlet_sale_items.item_code, outlet_sale_items.item_name, outlet_sale_items.unit, COALESCE(SUM(outlet_sale_items.quantity),0) as total_qty, COALESCE(SUM(outlet_sale_items.line_total),0) as total_amount')
            ->orderByDesc('total_qty')
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'outlet' => [
                    'id' => $outlet->id,
                    'name' => $outlet->name,
                    'code' => $outlet->code,
                ],
                'totals' => [
                    'total_sales' => (int) ($totals->total_sales ?? 0),
                    'total_quantity' => (float) ($totals->total_quantity ?? 0),
                    'total_amount' => (float) ($totals->total_amount ?? 0),
                ],
                'sales' => $sales,
                'item_wise' => $itemWise,
            ],
            'message' => 'Outlet sales report retrieved successfully',
        ]);
    }
}
