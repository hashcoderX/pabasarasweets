<?php

namespace App\Http\Controllers;

use App\Models\Outlet;
use App\Models\OutletSale;
use App\Models\OutletSaleItem;
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

        if ($existing) {
            $status = (string) ($existing->status ?? '');
            if ($status === 'open') {
                return response()->json(['success' => false, 'message' => 'Cashier is already open for this date'], 422);
            }

            return response()->json(['success' => false, 'message' => 'Cashier already closed for this date and cannot be reopened'], 422);
        }

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

        return response()->json([
            'success' => true,
            'data' => [
                'cash_drawer' => $this->cashDrawerByOutlet($activeOutlet->id),
                'session' => $this->cashierSessionStatusByOutlet($activeOutlet->id, $sessionDate),
            ],
            'message' => 'Cashier opened successfully',
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

        return response()->json([
            'success' => true,
            'data' => [
                'cash_drawer' => $this->cashDrawerByOutlet($activeOutlet->id),
                'session' => $this->cashierSessionStatusByOutlet($activeOutlet->id, $sessionDate),
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

        $sales = $query->orderByDesc('sale_date')->orderByDesc('id')->paginate($request->get('per_page', 20));

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
            'sale_mode' => 'nullable|in:order,exact_invoice',
            'outlet_id' => 'nullable|exists:outlets,id',
            'sale_date' => 'nullable|date',
            'customer_name' => 'nullable|string|max:255',
            'loyalty_customer_id' => 'nullable|exists:outlet_loyalty_customers,id',
            'load_id' => 'nullable|exists:loads,id',
            'delivery_employee_id' => 'nullable|exists:employees,id',
            'discount_amount' => 'nullable|numeric|min:0',
            'paid_amount' => 'nullable|numeric|min:0',
            'payment_type' => 'nullable|in:cash,bank,card,online',
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
        $isOrderMode = $saleMode === 'order';
        $outletId = $admin ? (int) ($payload['outlet_id'] ?? 0) : (int) $outlet?->id;

        if ($admin && $outletId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Outlet is required for admin sales entry',
            ], 422);
        }

        $activeOutlet = Outlet::where('id', $outletId)->where('status', 'active')->first();
        if (!$activeOutlet) {
            return response()->json(['success' => false, 'message' => 'Active outlet not found'], 404);
        }

        if ($this->hasCashDrawerTables()) {
            $status = $this->cashierSessionStatusByOutlet($activeOutlet->id);
            if (!$status['is_open']) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cashier is not open. Please open cash drawer first.',
                ], 422);
            }
        }

        try {
            $sale = DB::transaction(function () use ($payload, $activeOutlet, $user, $saleMode, $isOrderMode) {
                $salesHasStatus = Schema::hasColumn('outlet_sales', 'status');
                $salesHasDoNumber = Schema::hasColumn('outlet_sales', 'do_number');
                $salesHasLoadId = Schema::hasColumn('outlet_sales', 'load_id');
                $salesHasDeliveryEmployeeId = Schema::hasColumn('outlet_sales', 'delivery_employee_id');
                $salesHasDeliveryEmployeeName = Schema::hasColumn('outlet_sales', 'delivery_employee_name');

                $stock = $this->stockByOutlet($activeOutlet->id)->keyBy('inventory_item_id');
                $loyaltyCustomerId = (int) ($payload['loyalty_customer_id'] ?? 0);
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

                    if ($available < $qty) {
                        throw new \RuntimeException("Insufficient stock for item ID {$inventoryItemId}");
                    }

                    $lineTotal = $qty * $price;
                    $totalQty += $qty;
                    $totalAmount += $lineTotal;

                    $itemsToSave[] = [
                        'inventory_item_id' => $inventoryItemId,
                        'item_code' => (string) ($stockLine->code ?? ''),
                        'item_name' => (string) ($stockLine->name ?? ''),
                        'unit' => (string) ($stockLine->unit ?? ''),
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

                if ($balanceAmount > 0 && !$isOrderMode && !$loyaltyCustomer) {
                    throw new \RuntimeException('Credit sale is allowed only for loyalty customers. Please select a loyalty customer.');
                }

                $pointsAwarded = $loyaltyCustomer
                    ? round($netTotalAmount * self::LOYALTY_POINT_RATE, 2)
                    : 0;

                $saleData = [
                    'sale_number' => 'OPS' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 4)),
                    'outlet_id' => $activeOutlet->id,
                    'sold_by' => $user?->id,
                    'sale_date' => $payload['sale_date'] ?? now(),
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
                    $saleData['status'] = $saleMode === 'exact_invoice' ? 'exact_invoice' : 'ordered';
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

            return response()->json([
                'success' => true,
                'data' => $sale,
                'message' => 'Outlet POS sale recorded successfully',
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to record outlet sale',
                'error' => $e->getMessage(),
            ], 500);
        }
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
