<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionInvoiceItem;
use App\Models\DistributionPayment;
use App\Models\Employee;
use App\Models\InventoryItem;
use App\Models\Load;
use App\Models\LoadItem;
use App\Models\Company;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Barryvdh\DomPDF\Facade\Pdf;

class DistributionInvoiceController extends Controller
{
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
        $reportMode = $request->boolean('report_mode');

        $query = DistributionInvoice::query()->with([
            'customer:id,shop_name,customer_code,route_id',
        ]);

        if ($reportMode) {
            $query->withCount('items')
                ->select([
                    'id',
                    'invoice_number',
                    'customer_id',
                    'invoice_date',
                    'due_date',
                    'subtotal',
                    'discount',
                    'total',
                    'paid_amount',
                    'status',
                    'created_at',
                ]);
        } else {
            $query->with([
                'items',
                'payments:id,distribution_invoice_id,payment_date,cheque_date,amount,payment_method,reference_no,bank_name,status',
            ]);
        }

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

        if ($request->boolean('exclude_cancelled')) {
            $query->whereNotIn('status', ['cancelled', 'deleted']);
        }

        if ($request->filled('load_id')) {
            $query->where('load_id', (int) $request->load_id);
        }

        $perPage = max(1, min(500, (int) $request->get('per_page', 15)));

        if ($reportMode) {
            $cacheKey = 'distribution_invoices_report:' . md5(json_encode([
                'user_id' => (int) ($user?->id ?? 0),
                'employee_id' => (int) ($user?->employee_id ?? 0),
                'query' => $request->query(),
                'per_page' => $perPage,
            ]));

            $invoices = Cache::remember($cacheKey, now()->addSeconds(45), function () use ($query, $perPage) {
                return $query
                    ->orderByDesc('invoice_date')
                    ->orderByDesc('id')
                    ->paginate($perPage)
                    ->toArray();
            });
        } else {
            $invoices = $query
                ->orderByDesc('invoice_date')
                ->orderByDesc('id')
                ->paginate($perPage);
        }

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
                    $this->pushInvoiceLocationToTraccar($invoice);

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Distribution invoice created successfully',
        ], 201);
    }

                private function pushInvoiceLocationToTraccar(DistributionInvoice $invoice): void
                {
                    $enabled = (bool) config('services.traccar.enabled', false);
                    $endpoint = trim((string) config('services.traccar.endpoint', ''));

                    if (!$enabled || $endpoint === '') {
                        return;
                    }

                    $points = [
                        [
                            'type' => 'ref',
                            'lat' => $invoice->ref_latitude,
                            'lon' => $invoice->ref_longitude,
                            'accuracy' => $invoice->ref_gps_accuracy,
                            'captured_at' => $invoice->ref_gps_captured_at,
                        ],
                        [
                            'type' => 'billing',
                            'lat' => $invoice->billing_latitude,
                            'lon' => $invoice->billing_longitude,
                            'accuracy' => $invoice->billing_gps_accuracy,
                            'captured_at' => $invoice->billing_gps_captured_at,
                        ],
                    ];

                    $configuredDeviceId = trim((string) config('services.traccar.device_id', ''));
                    $deviceId = $configuredDeviceId !== ''
                        ? $configuredDeviceId
                        : 'invoice-' . (string) ($invoice->created_by ?? $invoice->id);

                    $apiToken = trim((string) config('services.traccar.api_token', ''));

                    foreach ($points as $point) {
                        $lat = is_null($point['lat']) ? null : (float) $point['lat'];
                        $lon = is_null($point['lon']) ? null : (float) $point['lon'];
                        if (is_null($lat) || is_null($lon)) {
                            continue;
                        }

                        $capturedAt = $point['captured_at'] ? Carbon::parse((string) $point['captured_at']) : now();

                        $payload = [
                            'deviceId' => $deviceId,
                            'latitude' => $lat,
                            'longitude' => $lon,
                            'fixTime' => $capturedAt->toIso8601String(),
                            'attributes' => [
                                'source' => 'distribution_invoice',
                                'invoice_id' => $invoice->id,
                                'invoice_number' => $invoice->invoice_number,
                                'point_type' => $point['type'],
                                'accuracy' => is_null($point['accuracy']) ? null : (float) $point['accuracy'],
                            ],
                        ];

                        try {
                            $request = Http::timeout(5)->acceptJson();
                            if ($apiToken !== '') {
                                $request = $request->withToken($apiToken);
                            }

                            $response = $request->post($endpoint, $payload);
                            if ($response->failed()) {
                                Log::warning('Traccar invoice location push failed', [
                                    'invoice_id' => $invoice->id,
                                    'status' => $response->status(),
                                    'body' => $response->body(),
                                ]);
                            }
                        } catch (\Throwable $e) {
                            Log::warning('Traccar invoice location push exception', [
                                'invoice_id' => $invoice->id,
                                'message' => $e->getMessage(),
                            ]);
                        }
                    }
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

    public function receipt(string $id)
    {
        $invoice = DistributionInvoice::with([
            'customer:id,shop_name,customer_code,address,phone',
            'items',
            'payments:id,distribution_invoice_id,payment_date,cheque_date,amount,payment_method,reference_no,bank_name,status',
        ])->find($id);

        if (!$invoice) {
            return response()->json(['success' => false, 'message' => 'Distribution invoice not found'], 404);
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

        $notes = (string) ($invoice->notes ?? '');
        $returnLines = [];
        $returnTotal = 0;
        $returnMode = '';
        foreach (preg_split('/\R/', $notes) ?: [] as $line) {
            $trimmed = trim($line);
            if (str_starts_with($trimmed, '- ') && str_contains($notes, '[ITEM RETURNS]')) {
                $returnLines[] = substr($trimmed, 2);
            }
            if (str_starts_with($trimmed, 'Total return value:')) {
                $returnTotal = (float) preg_replace('/[^0-9.\-]/', '', substr($trimmed, strlen('Total return value:')));
            }
            if (str_starts_with($trimmed, 'Return mode:')) {
                $returnMode = $trimmed;
            }
        }

        $itemRows = '';
        foreach ($invoice->items as $item) {
            $quantity = (float) $item->quantity;
            $price = (float) $item->unit_price;
            $itemRows .= '<tr><td>' . $escape($item->item_name) . '<br><small>' . $escape($item->item_code) . '</small></td><td class="right">' . $money($quantity) . '</td><td class="right">' . $money($price) . '</td><td class="right">' . $money($quantity * $price) . '</td></tr>';
        }

        $paymentRows = '';
        foreach ($invoice->payments as $payment) {
            $paymentDate = $payment->payment_date ? date('Y-m-d', strtotime((string) $payment->payment_date)) : '';
            $paymentRows .= '<tr><td>' . $escape(strtoupper((string) $payment->payment_method)) . '</td><td>' . $escape($paymentDate) . '</td><td>' . $escape($payment->reference_no) . '</td><td class="right">' . $money($payment->amount) . '</td></tr>';
        }

        $returnSection = $returnLines || $returnTotal > 0 ? '<section><h3>Returns / Exchange</h3>' . implode('', array_map(fn ($line) => '<div>' . $escape($line) . '</div>', $returnLines)) . ($returnTotal > 0 ? '<div><strong>Total return value:</strong> ' . $money($returnTotal) . '</div>' : '') . ($returnMode ? '<div>' . $escape($returnMode) . '</div>' : '') . '</section>' : '';
        $paid = (float) ($invoice->paid_amount ?? 0);
        $outstanding = max(0, (float) $invoice->total - $paid);

        $invoiceDate = $invoice->invoice_date ? date('Y-m-d', strtotime((string) $invoice->invoice_date)) : '';
        $html = '<!doctype html><html><head><meta charset="utf-8"><style>
            @page { margin: 12mm; }
            * { box-sizing: border-box; } body { font-family: DejaVu Sans, sans-serif; color: #172033; font-size: 10px; margin: 0; }
            .header { text-align: center; border-bottom: 2px solid #079669; padding-bottom: 9px; margin-bottom: 12px; }
            .logo { max-width: 42mm; max-height: 24mm; margin-bottom: 5px; } h1 { color: #087f68; margin: 0; font-size: 19px; } h2 { margin: 2px 0 0; font-size: 11px; font-weight: normal; color: #536174; }
            .meta { width: 100%; margin-bottom: 12px; } .meta td { vertical-align: top; padding: 2px 0; } .right { text-align: right; } h3 { background: #e8f8f2; border-left: 4px solid #079669; padding: 6px 8px; font-size: 11px; margin: 10px 0 5px; }
            table { width: 100%; border-collapse: collapse; } th { background: #f0f5f5; text-align: left; padding: 6px; } td { border-bottom: 1px solid #e5ebeb; padding: 6px; } small { color: #687585; }
            .summary { width: 50%; margin-left: auto; margin-top: 8px; } .summary td { border: 0; padding: 3px; } .total td { border-top: 2px solid #079669; font-weight: bold; font-size: 12px; }
            .footer { text-align: center; color: #687585; margin-top: 18px; border-top: 1px solid #dce7e4; padding-top: 8px; }
        </style></head><body>
            <div class="header">' . ($logo ? '<img class="logo" src="' . $logo . '">' : '') . '<h1>' . $escape($company?->name ?: 'Company') . '</h1>' . ($company?->address ? '<h2>' . $escape($company->address) . '</h2>' : '') . ($company?->phone ? '<h2>Tel: ' . $escape($company->phone) . '</h2>' : '') . ($company?->email ? '<h2>' . $escape($company->email) . '</h2>' : '') . '</div>
            <table class="meta"><tr><td><strong>Invoice:</strong> ' . $escape($invoice->invoice_number) . '<br><strong>Date:</strong> ' . $escape($invoiceDate) . '</td><td class="right"><strong>Customer:</strong><br>' . $escape($invoice->customer?->shop_name) . '<br>' . $escape($invoice->customer?->customer_code) . ($invoice->customer?->address ? '<br>' . $escape($invoice->customer->address) : '') . '</td></tr></table>
            <section><h3>Billing Item Details</h3><table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead><tbody>' . $itemRows . '</tbody></table></section>
            ' . $returnSection . '
            <section><h3>Payment Details</h3>' . ($paymentRows ? '<table><thead><tr><th>Method</th><th>Date</th><th>Reference / Cheque</th><th class="right">Amount</th></tr></thead><tbody>' . $paymentRows . '</tbody></table>' : '<div>No payments recorded.</div>') . '</section>
            <table class="summary"><tr><td>Subtotal</td><td class="right">' . $money($invoice->subtotal) . '</td></tr><tr><td>Discount</td><td class="right">-' . $money($invoice->discount) . '</td></tr><tr class="total"><td>Total</td><td class="right">' . $money($invoice->total) . '</td></tr><tr><td>Paid</td><td class="right">' . $money($paid) . '</td></tr><tr><td>Outstanding</td><td class="right">' . $money($outstanding) . '</td></tr></table>
            <div class="footer">Generated invoice receipt</div>
        </body></html>';

        return Pdf::loadHTML($html)->setPaper('a4')->download('invoice-receipt-' . $invoice->invoice_number . '.pdf');
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
