<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionPayment;
use App\Models\DistributionCustomer;
use App\Models\Employee;
use App\Models\Load;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DistributionPaymentController extends Controller
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
        $query = DistributionPayment::with([
            'customer:id,shop_name,customer_code',
            'invoice:id,invoice_number,total,paid_amount,status',
        ]);

        $user = $request->user();

        if ($user) {
            $isAdmin = (!$user->employee_id) || $user->hasRole('Super Admin');

            if (!$isAdmin && $user->employee_id) {
                $accessibleEmployeeIds = $this->resolveAccessibleEmployeeIds((int) $user->employee_id);
                $routeIds = Load::whereIn('sales_ref_id', $accessibleEmployeeIds)
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
                    // No allocated routes for this sales ref - hide payments
                    $query->whereRaw('1 = 0');
                }
            }
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        if ($request->filled('load_id')) {
            $query->where('load_id', (int) $request->load_id);
        }

        $payments = $query->orderByDesc('payment_date')->orderByDesc('id')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $payments,
            'message' => 'Distribution payments retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'payment_number' => 'required|string|max:60|unique:distribution_payments,payment_number',
            'distribution_invoice_id' => 'nullable|exists:distribution_invoices,id',
            'load_id' => 'nullable|exists:loads,id',
            'customer_id' => 'required|exists:distribution_customers,id',
            'payment_date' => 'required|date',
            'cheque_date' => 'nullable|date|required_if:payment_method,check',
            'amount' => 'required|numeric|gt:0',
            'payment_method' => 'required|in:check,cash,bank_transfer',
            'reference_no' => 'nullable|string|max:100',
            'bank_name' => 'nullable|string|max:255',
            'status' => 'nullable|in:received,cleared,bounced,pending',
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

        $payment = DB::transaction(function () use ($payload, $request) {
            $paymentsHasLoadId = Schema::hasColumn('distribution_payments', 'load_id');
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

            $paymentData = [
                'payment_number' => $payload['payment_number'],
                'distribution_invoice_id' => $payload['distribution_invoice_id'] ?? null,
                'customer_id' => $payload['customer_id'],
                'payment_date' => $payload['payment_date'],
                'cheque_date' => $payload['payment_method'] === 'check'
                    ? ($payload['cheque_date'] ?? null)
                    : null,
                'amount' => $payload['amount'],
                'payment_method' => $payload['payment_method'],
                'reference_no' => $payload['reference_no'] ?? null,
                'bank_name' => $payload['bank_name'] ?? null,
                'status' => $payload['status'] ?? 'received',
                'notes' => $payload['notes'] ?? null,
                'received_by' => $request->user()?->id,
            ];

            if ($paymentsHasLoadId) {
                $paymentData['load_id'] = $loadId;
            }

            $payment = DistributionPayment::create($paymentData);

            if (!empty($payload['distribution_invoice_id'])) {
                $invoice = DistributionInvoice::find($payload['distribution_invoice_id']);
                if ($invoice) {
                    $invoice->paid_amount = (float) $invoice->paid_amount + (float) $payload['amount'];

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

            $customer = DistributionCustomer::find($payload['customer_id']);
            if ($customer) {
                $currentOutstanding = (float) ($customer->outstanding ?? 0);
                $customer->outstanding = max(0, $currentOutstanding - (float) $payload['amount']);
                $customer->save();
            }

            return $payment;
        });

        return response()->json([
            'success' => true,
            'data' => $payment->load([
                'customer:id,shop_name,customer_code',
                'invoice:id,invoice_number,total,paid_amount,status',
            ]),
            'message' => 'Distribution payment recorded successfully',
        ], 201);
    }

    public function bulkStore(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'payments' => 'required|array|min:1',
            'payments.*.payment_number' => 'required|string|max:60|distinct|unique:distribution_payments,payment_number',
            'payments.*.distribution_invoice_id' => 'nullable|exists:distribution_invoices,id',
            'payments.*.load_id' => 'nullable|exists:loads,id',
            'payments.*.customer_id' => 'required|exists:distribution_customers,id',
            'payments.*.payment_date' => 'required|date',
            'payments.*.cheque_date' => 'nullable|date|required_if:payments.*.payment_method,check',
            'payments.*.amount' => 'required|numeric|gt:0',
            'payments.*.payment_method' => 'required|in:check,cash,bank_transfer',
            'payments.*.reference_no' => 'nullable|string|max:100',
            'payments.*.bank_name' => 'nullable|string|max:255',
            'payments.*.status' => 'nullable|in:received,cleared,bounced,pending',
            'payments.*.notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payments = DB::transaction(function () use ($validator, $request) {
            return collect($validator->validated()['payments'])
                ->map(fn (array $payload) => $this->createPayment($payload, $request))
                ->values();
        });

        return response()->json([
            'success' => true,
            'data' => $payments,
            'message' => 'Distribution payments recorded successfully',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $payment = DistributionPayment::with([
            'customer:id,shop_name,customer_code',
            'invoice:id,invoice_number,total,paid_amount,status',
        ])->find($id);

        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution payment not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $payment,
            'message' => 'Distribution payment retrieved successfully',
        ]);
    }

    private function createPayment(array $payload, Request $request): DistributionPayment
    {
        $paymentsHasLoadId = Schema::hasColumn('distribution_payments', 'load_id');
        $loadId = null;

        if (!empty($payload['distribution_invoice_id'])) {
            $invoice = DistributionInvoice::find($payload['distribution_invoice_id']);
            $loadId = $invoice?->load_id;
        }

        $loadId ??= $payload['load_id'] ?? null;

        $paymentData = [
            'payment_number' => $payload['payment_number'],
            'distribution_invoice_id' => $payload['distribution_invoice_id'] ?? null,
            'customer_id' => $payload['customer_id'],
            'payment_date' => $payload['payment_date'],
            'cheque_date' => ($payload['payment_method'] ?? '') === 'check' ? ($payload['cheque_date'] ?? null) : null,
            'amount' => $payload['amount'],
            'payment_method' => $payload['payment_method'],
            'reference_no' => $payload['reference_no'] ?? null,
            'bank_name' => $payload['bank_name'] ?? null,
            'status' => $payload['status'] ?? 'received',
            'notes' => $payload['notes'] ?? null,
            'received_by' => $request->user()?->id,
        ];

        if ($paymentsHasLoadId) $paymentData['load_id'] = $loadId;
        $payment = DistributionPayment::create($paymentData);

        if (!empty($payload['distribution_invoice_id'])) {
            $invoice = DistributionInvoice::find($payload['distribution_invoice_id']);
            if ($invoice) {
                $invoice->paid_amount = (float) $invoice->paid_amount + (float) $payload['amount'];
                $invoice->status = (float) $invoice->paid_amount >= (float) $invoice->total
                    ? 'paid'
                    : ((float) $invoice->paid_amount > 0 ? 'partial' : 'pending');
                $invoice->save();
            }
        }

        $customer = DistributionCustomer::find($payload['customer_id']);
        if ($customer) {
            $customer->outstanding = max(0, (float) ($customer->outstanding ?? 0) - (float) $payload['amount']);
            $customer->save();
        }

        return $payment;
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $payment = DistributionPayment::find($id);

        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution payment not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'payment_date' => 'required|date',
            'payment_method' => 'required|in:check,cash,bank_transfer',
            'cheque_date' => 'nullable|date|required_if:payment_method,check',
            'reference_no' => 'nullable|string|max:100',
            'bank_name' => 'nullable|string|max:255',
            'status' => 'nullable|in:received,cleared,bounced,pending',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $updateData = $validator->validated();
        $updateData['cheque_date'] = ($updateData['payment_method'] ?? $payment->payment_method) === 'check'
            ? ($updateData['cheque_date'] ?? $payment->cheque_date)
            : null;

        $payment->update($updateData);

        return response()->json([
            'success' => true,
            'data' => $payment->load([
                'customer:id,shop_name,customer_code',
                'invoice:id,invoice_number,total,paid_amount,status',
            ]),
            'message' => 'Distribution payment updated successfully',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $payment = DistributionPayment::find($id);

        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution payment not found',
            ], 404);
        }

        DB::transaction(function () use ($payment) {
            $customer = DistributionCustomer::find($payment->customer_id);
            if ($customer) {
                $currentOutstanding = (float) ($customer->outstanding ?? 0);
                $customer->outstanding = max(0, $currentOutstanding + (float) $payment->amount);
                $customer->save();
            }

            if (!empty($payment->distribution_invoice_id)) {
                $invoice = DistributionInvoice::find($payment->distribution_invoice_id);
                if ($invoice) {
                    $invoice->paid_amount = max(0, (float) $invoice->paid_amount - (float) $payment->amount);

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

            $payment->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Distribution payment deleted successfully',
        ]);
    }
}
