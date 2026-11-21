<?php

namespace App\Http\Controllers;

use App\Models\DistributionDo;
use App\Models\DistributionDoItem;
use App\Models\Employee;
use App\Models\InventoryItem;
use App\Models\Load;
use App\Models\LoadItem;
use App\Models\Company;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DistributionDoController extends Controller
{
    private function generateDoNumber(): string
    {
        do {
            $candidate = 'DO-' . now()->format('Ymd') . '-' . random_int(100, 999);
            $exists = DistributionDo::query()->where('do_number', $candidate)->exists();
        } while ($exists);

        return $candidate;
    }

    private function resolveAccessibleEmployeeIds(int $employeeId): array
    {
        $accessible = [$employeeId];
        $frontier = [$employeeId];
        $visited = [$employeeId => true];
        $maxDepth = 12;
        $depth = 0;

        while (!empty($frontier) && $depth < $maxDepth) {
            $childIds = Employee::query()
                ->whereIn('reporting_person_id', $frontier)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $nextFrontier = [];
            foreach ($childIds as $childId) {
                if (isset($visited[$childId])) {
                    continue;
                }

                $visited[$childId] = true;
                $accessible[] = $childId;
                $nextFrontier[] = $childId;
            }

            $frontier = $nextFrontier;
            $depth++;
        }

        return $accessible;
    }

    public function index(Request $request): JsonResponse
    {
        $query = DistributionDo::query()->with([
            'customer:id,shop_name,customer_code,route_id',
            'items',
        ]);

        $user = $request->user();
        if ($user) {
            $isAdmin = (!$user->employee_id) || $user->hasRole('Super Admin');

            if (!$isAdmin && $user->employee_id) {
                $accessibleEmployeeIds = $this->resolveAccessibleEmployeeIds((int) $user->employee_id);
                $loads = Load::with('loadRoutes:load_id,route_id')
                    ->select(['id', 'route_id'])
                    ->whereIn('sales_ref_id', $accessibleEmployeeIds)
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
                    $query->whereRaw('1 = 0');
                }
            }
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', (int) $request->customer_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('do_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('do_date', '<=', $request->to_date);
        }

        if ($request->filled('q')) {
            $searchText = trim((string) $request->q);
            $query->where(function ($q) use ($searchText) {
                $q->where('do_number', 'like', '%' . $searchText . '%')
                    ->orWhereHas('customer', function ($customerQuery) use ($searchText) {
                        $customerQuery
                            ->where('shop_name', 'like', '%' . $searchText . '%')
                            ->orWhere('customer_code', 'like', '%' . $searchText . '%');
                    });
            });
        }

        if ($request->filled('load_id')) {
            $query->where('load_id', (int) $request->load_id);
        }

        $perPage = max(1, min(500, (int) $request->get('per_page', 15)));
        $rows = $query->orderByDesc('do_date')->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $rows,
            'message' => 'Distribution DO records retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'do_number' => 'nullable|string|max:60|unique:distribution_dos,do_number',
            'invoice_number' => 'nullable|string|max:60',
            'customer_id' => 'required|exists:distribution_customers,id',
            'load_id' => 'nullable|exists:loads,id',
            'do_date' => 'nullable|date',
            'delivery_date' => 'nullable|date',
            'call_confirmed' => 'nullable|boolean',
            'invoice_date' => 'nullable|date',
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

        $record = DB::transaction(function () use ($payload, $request) {
            $user = $request->user();
            $doItemsHasLoadId = Schema::hasColumn('distribution_do_items', 'load_id');
            $doHasDeliveryDate = Schema::hasColumn('distribution_dos', 'delivery_date');
            $doHasCallConfirmed = Schema::hasColumn('distribution_dos', 'call_confirmed');

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

            $doDate = $payload['do_date']
                ?? $payload['invoice_date']
                ?? now()->toDateString();
            $deliveryDate = $payload['delivery_date'] ?? $payload['due_date'] ?? $doDate;
            $callConfirmed = (bool) ($payload['call_confirmed'] ?? false);

            $requestedNumber = trim((string) ($payload['do_number'] ?? $payload['invoice_number'] ?? ''));
            $doNumber = $requestedNumber !== ''
                ? $requestedNumber
                : $this->generateDoNumber();

            $doNotes = trim((string) ($payload['notes'] ?? ''));
            $notesPrefix = "[DO (PROFORMA INVOICE)]\nDO Number: {$doNumber}";
            $notes = $doNotes !== '' ? ($notesPrefix . "\n\n" . $doNotes) : $notesPrefix;

            $doData = [
                'do_number' => $doNumber,
                'customer_id' => $payload['customer_id'],
                'load_id' => $activeLoad?->id,
                'do_date' => $doDate,
                'due_date' => $payload['due_date'] ?? $deliveryDate,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'paid_amount' => 0,
                'status' => 'pending',
                'notes' => $notes,
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
            if ($doHasDeliveryDate) {
                $doData['delivery_date'] = $deliveryDate;
            }
            if ($doHasCallConfirmed) {
                $doData['call_confirmed'] = $callConfirmed;
            }
            $record = DistributionDo::create($doData);

            foreach ($payload['items'] as $item) {
                $lineTotal = (float) $item['quantity'] * (float) $item['unit_price'];

                $itemData = [
                    'distribution_do_id' => $record->id,
                    'inventory_item_id' => $item['inventory_item_id'] ?? null,
                    'item_code' => $item['item_code'],
                    'item_name' => $item['item_name'],
                    'unit' => $item['unit'] ?? null,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'discount' => (float) ($item['discount'] ?? 0),
                    'line_total' => $lineTotal,
                ];

                if ($doItemsHasLoadId) {
                    $itemData['load_id'] = $activeLoad?->id;
                }

                DistributionDoItem::create($itemData);

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

            return $record->load(['customer:id,shop_name,customer_code,route_id', 'items']);
        });

        $record->invoice_number = $record->do_number;
        $record->invoice_date = (string) $record->do_date;

        return response()->json([
            'success' => true,
            'data' => $record,
            'message' => 'DO (Proforma Invoice) created successfully',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $record = DistributionDo::with([
            'customer:id,shop_name,customer_code,route_id',
            'items',
        ])->find($id);

        if (!$record) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution DO not found',
            ], 404);
        }

        $record->invoice_number = $record->do_number;
        $record->invoice_date = (string) $record->do_date;

        return response()->json([
            'success' => true,
            'data' => $record,
            'message' => 'Distribution DO retrieved successfully',
        ]);
    }

    public function receipt(string $id)
    {
        $record = DistributionDo::with([
            'customer:id,shop_name,customer_code,address,phone',
            'items',
        ])->find($id);

        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Distribution DO not found'], 404);
        }

        $company = Company::query()->first();
        $escape = static fn ($value): string => e((string) ($value ?? ''));
        $money = static fn ($value): string => number_format((float) ($value ?? 0), 2);
        $logo = '';

        if ($company?->logo_path) {
            $logoPath = storage_path('app/public/' . ltrim((string) $company->logo_path, '/'));
            if (is_file($logoPath)) {
                $mime = mime_content_type($logoPath) ?: 'image/png';
                $logo = 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($logoPath));
            }
        }

        $deliveryDate = $record->delivery_date ? date('Y-m-d', strtotime((string) $record->delivery_date)) : ($record->due_date ? date('Y-m-d', strtotime((string) $record->due_date)) : '');
        $callConfirmed = $record->call_confirmed ? 'YES' : 'NO';
        $doDate = $record->do_date ? date('Y-m-d', strtotime((string) $record->do_date)) : '';

        $itemRows = '';
        foreach ($record->items as $item) {
            $quantity = (float) $item->quantity;
            $price = (float) $item->unit_price;
            $discount = (float) ($item->discount ?? 0);
            $lineTotal = (float) $item->line_total;
            $itemRows .= '<tr><td>' . $escape($item->item_name) . '<br><small>' . $escape($item->item_code) . '</small></td><td class="right">' . $money($quantity) . '</td><td class="right">' . $money($price) . '</td><td class="right">' . $money($discount) . '</td><td class="right">' . $money($lineTotal) . '</td></tr>';
        }

        $html = '<!doctype html><html><head><meta charset="utf-8"><style>
            @page { margin: 12mm; }
            * { box-sizing: border-box; } body { font-family: DejaVu Sans, sans-serif; color: #172033; font-size: 10px; margin: 0; }
            .header { text-align: center; border-bottom: 2px solid #079669; padding-bottom: 9px; margin-bottom: 12px; }
            .logo { max-width: 42mm; max-height: 24mm; margin-bottom: 5px; } h1 { color: #087f68; margin: 0; font-size: 19px; } h2 { margin: 2px 0 0; font-size: 11px; font-weight: normal; color: #536174; }
            .meta { width: 100%; margin-bottom: 12px; } .meta td { vertical-align: top; padding: 2px 0; } .right { text-align: right; } h3 { background: #e8f8f2; border-left: 4px solid #079669; padding: 6px 8px; font-size: 11px; margin: 10px 0 5px; }
            table { width: 100%; border-collapse: collapse; } th { background: #f0f5f5; text-align: left; padding: 6px; } td { border-bottom: 1px solid #e5ebeb; padding: 6px; } small { color: #687585; }
            .summary { width: 52%; margin-left: auto; margin-top: 8px; } .summary td { border: 0; padding: 3px; } .total td { border-top: 2px solid #079669; font-weight: bold; font-size: 12px; }
            .footer { text-align: center; color: #687585; margin-top: 18px; border-top: 1px solid #dce7e4; padding-top: 8px; }
        </style></head><body>
            <div class="header">' . ($logo ? '<img class="logo" src="' . $logo . '">' : '') . '<h1>' . $escape($company?->name ?: 'Company') . '</h1>' . ($company?->address ? '<h2>' . $escape($company->address) . '</h2>' : '') . ($company?->phone ? '<h2>Tel: ' . $escape($company->phone) . '</h2>' : '') . ($company?->email ? '<h2>' . $escape($company->email) . '</h2>' : '') . '</div>
            <table class="meta"><tr><td><strong>DO:</strong> ' . $escape($record->do_number) . '<br><strong>DO Date:</strong> ' . $escape($doDate) . '<br><strong>Delivery Date:</strong> ' . $escape($deliveryDate) . '<br><strong>Customer Call Confirmed:</strong> ' . $escape($callConfirmed) . '</td><td class="right"><strong>Customer:</strong><br>' . $escape($record->customer?->shop_name) . '<br>' . $escape($record->customer?->customer_code) . ($record->customer?->address ? '<br>' . $escape($record->customer->address) : '') . '</td></tr></table>
            <section><h3>DO Item Details</h3><table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Discount</th><th class="right">Amount</th></tr></thead><tbody>' . $itemRows . '</tbody></table></section>
            <table class="summary"><tr><td>Subtotal</td><td class="right">' . $money($record->subtotal) . '</td></tr><tr><td>Discount</td><td class="right">-' . $money($record->discount) . '</td></tr><tr class="total"><td>Total</td><td class="right">' . $money($record->total) . '</td></tr></table>
            <div class="footer">Generated delivery order receipt</div>
        </body></html>';

        return Pdf::loadHTML($html)->setPaper('a4')->download('do-receipt-' . $record->do_number . '.pdf');
    }
}
