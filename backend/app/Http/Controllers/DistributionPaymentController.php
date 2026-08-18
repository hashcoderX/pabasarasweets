<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionPayment;
use App\Models\DistributionCustomer;
use App\Models\Load;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DistributionPaymentController extends Controller
{
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
