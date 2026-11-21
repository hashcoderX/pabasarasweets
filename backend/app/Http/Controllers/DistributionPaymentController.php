<?php

namespace App\Http\Controllers;

use App\Models\DistributionInvoice;
use App\Models\DistributionPayment;
use App\Models\DistributionCustomer;
use App\Models\Company;
use App\Models\CompanyBankAccount;
use App\Models\Employee;
use App\Models\Load;
use App\Models\MainCashTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class DistributionPaymentController extends Controller
{
    private function isAdminUser($user): bool
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

    private function failValidation(string $field, string $message): void
    {
        throw ValidationException::withMessages([
            $field => [$message],
        ]);
    }

    private function parseBankAccountNumber(?string $bankLabel): ?string
    {
        $label = trim((string) $bankLabel);
        if ($label === '') {
            return null;
        }

        if (preg_match('/A\/C:\s*([^)]+)/i', $label, $matches)) {
            return trim((string) ($matches[1] ?? '')) ?: null;
        }

        return null;
    }

    private function parseBankName(?string $bankLabel): ?string
    {
        $label = trim((string) $bankLabel);
        if ($label === '') {
            return null;
        }

        if (preg_match('/^(.+?)(?:\s*-\s*.+)?(?:\s*\(A\/C:.*\))?$/i', $label, $matches)) {
            return trim((string) ($matches[1] ?? '')) ?: null;
        }

        return $label;
    }

    private function findCompanyBankAccountForTransfer(?string $bankLabel): ?CompanyBankAccount
    {
        $accountNo = $this->parseBankAccountNumber($bankLabel);
        if ($accountNo) {
            return CompanyBankAccount::query()
                ->whereRaw('LOWER(TRIM(account_no)) = ?', [strtolower(trim($accountNo))])
                ->orderBy('id')
                ->first();
        }

        $bankName = $this->parseBankName($bankLabel);
        if ($bankName) {
            return CompanyBankAccount::query()
                ->whereRaw('LOWER(TRIM(bank_name)) = ?', [strtolower(trim($bankName))])
                ->orderBy('id')
                ->first();
        }

        return null;
    }

    private function resolveMainCompanyId(?CompanyBankAccount $bankAccount): ?int
    {
        if ($bankAccount && !empty($bankAccount->company_id)) {
            return (int) $bankAccount->company_id;
        }

        $company = Company::query()->orderBy('id')->first();
        return $company ? (int) $company->id : null;
    }

    private function hasBankTransferPosting(DistributionPayment $payment): bool
    {
        return MainCashTransaction::query()
            ->where('reference', 'DEP-DISTPAY-' . $payment->id)
            ->exists();
    }

    private function revertCustomerAndInvoiceAmounts(DistributionPayment $payment): void
    {
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
    }

    private function applyBankTransferPosting(DistributionPayment $payment, Request $request): void
    {
        if (($payment->payment_method ?? '') !== 'bank_transfer') {
            return;
        }

        if ($this->hasBankTransferPosting($payment)) {
            return;
        }

        $companyBankAccount = $this->findCompanyBankAccountForTransfer($payment->bank_name);
        $companyId = $this->resolveMainCompanyId($companyBankAccount);

        if (!$companyId) {
            $this->failValidation('bank_name', 'No company profile found to post bank transfer payment.');
        }

        if (!$companyBankAccount) {
            $this->failValidation('bank_name', 'Select a valid company bank account for bank transfer payment.');
        }

        $lockedAccount = CompanyBankAccount::query()
            ->whereKey($companyBankAccount->id)
            ->lockForUpdate()
            ->first();

        if (!$lockedAccount) {
            $this->failValidation('bank_name', 'Selected company bank account is not available.');
        }

        $lockedAccount->update([
            'current_balance' => round((float) ($lockedAccount->current_balance ?? 0) + (float) $payment->amount, 2),
        ]);

        $company = Company::query()->whereKey($companyId)->lockForUpdate()->first();
        if ($company) {
            $companyBankBalance = round((float) $company->bankAccounts()->sum('current_balance'), 2);
            $company->update(['current_bank_balance' => $companyBankBalance]);
        }

        $customer = DistributionCustomer::query()->find($payment->customer_id);
        $customerName = trim((string) ($customer?->shop_name ?? 'Customer'));
        $bankLabel = trim((string) ($payment->bank_name ?: $lockedAccount->bank_name ?: 'Bank'));

        MainCashTransaction::create([
            'date' => $payment->payment_date,
            'type' => 'in',
            'amount' => $payment->amount,
            'reference' => 'DEP-DISTPAY-' . $payment->id,
            'note' => 'Distribution payment received via bank transfer. Dr Bank - ' . $bankLabel . ', Cr Accounts Receivable - ' . $customerName . '.',
            'created_by' => $request->user()?->id,
        ]);
    }

    private function reverseBankTransferPosting(DistributionPayment $payment): void
    {
        if (($payment->payment_method ?? '') !== 'bank_transfer') {
            return;
        }

        if (!$this->hasBankTransferPosting($payment)) {
            return;
        }

        $companyBankAccount = $this->findCompanyBankAccountForTransfer($payment->bank_name);
        if (!$companyBankAccount) {
            $this->failValidation('payment_method', 'Cannot reverse bank transfer posting because the linked company bank account was not found.');
        }

        $lockedAccount = CompanyBankAccount::query()
            ->whereKey($companyBankAccount->id)
            ->lockForUpdate()
            ->first();

        if (!$lockedAccount) {
            $this->failValidation('payment_method', 'Cannot reverse bank transfer posting because the linked company bank account is unavailable.');
        }

        $available = (float) ($lockedAccount->current_balance ?? 0);
        $amount = (float) $payment->amount;
        if ($available < $amount) {
            $this->failValidation('payment_method', 'Cannot reverse bank transfer posting because bank account balance is lower than the payment amount.');
        }

        $lockedAccount->update([
            'current_balance' => round($available - $amount, 2),
        ]);

        if (!empty($lockedAccount->company_id)) {
            $company = Company::query()->whereKey($lockedAccount->company_id)->lockForUpdate()->first();
            if ($company) {
                $companyBankBalance = round((float) $company->bankAccounts()->sum('current_balance'), 2);
                $company->update(['current_bank_balance' => $companyBankBalance]);
            }
        }

        MainCashTransaction::query()
            ->where('reference', 'DEP-DISTPAY-' . $payment->id)
            ->delete();
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

    public function pendingBankTransfers(Request $request): JsonResponse
    {
        $query = DistributionPayment::query()
            ->with([
                'customer:id,shop_name,customer_code',
                'invoice:id,invoice_number',
            ])
            ->where('payment_method', 'bank_transfer')
            ->where('status', 'pending')
            ->orderByDesc('payment_date')
            ->orderByDesc('id');

        $rows = $query->paginate($request->integer('per_page', 200));

        return response()->json([
            'success' => true,
            'data' => $rows,
            'message' => 'Pending distribution bank transfers retrieved successfully',
        ]);
    }

    public function acceptPendingBankTransfer(Request $request, string $id): JsonResponse
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Only admin users can accept pending bank transfers.',
            ], 403);
        }

        $payment = DistributionPayment::find($id);
        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution payment not found',
            ], 404);
        }

        if ((string) $payment->payment_method !== 'bank_transfer') {
            return response()->json([
                'success' => false,
                'message' => 'Only bank transfer payments are eligible for this action.',
            ], 422);
        }

        if ((string) $payment->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'This payment is already processed.',
            ], 422);
        }

        DB::transaction(function () use ($payment, $request) {
            $lockedPayment = DistributionPayment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            $this->applyBankTransferPosting($lockedPayment, $request);
            $lockedPayment->status = 'received';
            $lockedPayment->save();
        });

        return response()->json([
            'success' => true,
            'message' => 'Pending bank transfer accepted and posted to main bank account.',
        ]);
    }

    public function rejectPendingBankTransfer(Request $request, string $id): JsonResponse
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Only admin users can reject pending bank transfers.',
            ], 403);
        }

        $payment = DistributionPayment::find($id);
        if (!$payment) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution payment not found',
            ], 404);
        }

        if ((string) $payment->payment_method !== 'bank_transfer') {
            return response()->json([
                'success' => false,
                'message' => 'Only bank transfer payments are eligible for this action.',
            ], 422);
        }

        if ((string) $payment->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'This payment is already processed.',
            ], 422);
        }

        DB::transaction(function () use ($payment) {
            $lockedPayment = DistributionPayment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            $this->revertCustomerAndInvoiceAmounts($lockedPayment);
            $lockedPayment->status = 'returned';
            $lockedPayment->save();
        });

        return response()->json([
            'success' => true,
            'message' => 'Pending bank transfer rejected successfully.',
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
            'status' => 'nullable|in:received,cleared,bounced,pending,returned,closed',
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
        $payment = DB::transaction(fn () => $this->createPayment($payload, $request));

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
            'payments.*.status' => 'nullable|in:received,cleared,bounced,pending,returned,closed',
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

        $incomingStatus = (string) ($payload['status'] ?? 'received');
        $effectiveStatus = ($payload['payment_method'] ?? '') === 'bank_transfer'
            ? 'pending'
            : $incomingStatus;

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
            'status' => $effectiveStatus,
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

        if ($payment->payment_method === 'bank_transfer' && $payment->status !== 'pending') {
            $this->applyBankTransferPosting($payment, $request);
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
            'status' => 'nullable|in:received,cleared,bounced,pending,returned,closed',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        DB::transaction(function () use ($payment, $validator, $request) {
            $beforeMethod = (string) $payment->payment_method;
            $updateData = $validator->validated();
            $nextMethod = (string) ($updateData['payment_method'] ?? $payment->payment_method);
            $updateData['cheque_date'] = $nextMethod === 'check'
                ? ($updateData['cheque_date'] ?? $payment->cheque_date)
                : null;

            if ($beforeMethod === 'bank_transfer') {
                $this->reverseBankTransferPosting($payment);
            }

            $payment->update($updateData);
            $payment->refresh();

            $nextStatus = strtolower((string) ($payment->status ?? ''));
            if ($nextMethod === 'bank_transfer' && $nextStatus !== 'pending') {
                $this->applyBankTransferPosting($payment, $request);
            }
        });

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
            if ((string) $payment->payment_method === 'bank_transfer') {
                $this->reverseBankTransferPosting($payment);
            }

            $this->revertCustomerAndInvoiceAmounts($payment);

            $payment->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Distribution payment deleted successfully',
        ]);
    }
}
