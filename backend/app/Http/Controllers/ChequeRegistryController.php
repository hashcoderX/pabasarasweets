<?php

namespace App\Http\Controllers;

use App\Models\ChequeRegistryEntry;
use App\Models\Company;
use App\Models\CompanyBankAccount;
use App\Models\CompanyChequeAccount;
use App\Models\DistributionCustomer;
use App\Models\DistributionInvoice;
use App\Models\DistributionPayment;
use App\Models\MainCashTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ChequeRegistryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ChequeRegistryEntry::with([
            'company:id,name',
            'bankAccount:id,company_id,bank_name,account_no,current_balance',
            'chequeAccount:id,company_id,bank_name,account_no,current_balance',
            'distributionPayment:id,payment_number,payment_date,amount,payment_method,reference_no,status,received_by,customer_id',
            'distributionPayment.customer:id,shop_name,customer_code',
        ])->orderByDesc('created_at');

        if ($request->filled('direction')) {
            $query->where('direction', $request->input('direction'));
        }

        if ($request->filled('lifecycle_status')) {
            $query->where('lifecycle_status', $request->input('lifecycle_status'));
        }

        if ($request->filled('source_module')) {
            $query->where('source_module', $request->input('source_module'));
        }

        $entries = $query->paginate((int) $request->input('per_page', 25));

        $distributionCheques = DB::table('distribution_payments as dp')
            ->leftJoin('distribution_customers as dc', 'dc.id', '=', 'dp.customer_id')
            ->leftJoin('users as u', 'u.id', '=', 'dp.received_by')
            ->leftJoin('loads as l', 'l.id', '=', 'dp.load_id')
            ->where('dp.payment_method', 'check')
            ->orderByDesc('dp.payment_date')
            ->orderByDesc('dp.id')
            ->select([
                'dp.id',
                'dp.payment_number',
                'dp.payment_date',
                'dp.cheque_date',
                'dp.reference_no as cheque_no',
                'dp.amount',
                'dp.reference_no',
                'dp.bank_name',
                'dp.status',
                'dp.notes',
                'dp.created_at',
                'l.load_number',
                DB::raw("COALESCE(dc.shop_name, '-') as customer_name"),
                DB::raw("COALESCE(dc.customer_code, '-') as customer_code"),
                DB::raw("COALESCE(u.name, 'Unknown') as sales_person_name"),
            ])
            ->get();

        return response()->json([
            'success' => true,
            'data' => $entries,
            'distribution_cheques' => $distributionCheques,
            'message' => 'Cheque registry retrieved successfully',
        ]);
    }

    public function registerReceived(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'company_id' => 'required|exists:companies,id',
            'cheque_no' => 'required|string|max:100',
            'cheque_date' => 'required|date',
            'amount' => 'required|numeric|gt:0',
            'bank_name' => 'nullable|string|max:255',
            'account_no' => 'nullable|string|max:100',
            'counterparty_name' => 'required|string|max:255',
            'reference_no' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'source_module' => 'nullable|in:manual,distribution',
            'distribution_payment_id' => 'nullable|exists:distribution_payments,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        if (($payload['source_module'] ?? 'manual') === 'distribution' && empty($payload['distribution_payment_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution payment is required when source module is distribution.',
            ], 422);
        }

        $entry = ChequeRegistryEntry::create([
            'company_id' => $payload['company_id'],
            'company_bank_account_id' => null,
            'direction' => 'received',
            'lifecycle_status' => 'registered',
            'source_module' => $payload['source_module'] ?? 'manual',
            'distribution_payment_id' => $payload['distribution_payment_id'] ?? null,
            'cheque_no' => $payload['cheque_no'],
            'cheque_date' => $payload['cheque_date'],
            'amount' => $payload['amount'],
            'bank_name' => $payload['bank_name'] ?? null,
            'account_no' => $payload['account_no'] ?? null,
            'counterparty_name' => $payload['counterparty_name'],
            'reference_no' => $payload['reference_no'] ?? null,
            'notes' => $payload['notes'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'data' => $entry->load(['company:id,name', 'bankAccount:id,company_id,bank_name,account_no,current_balance']),
            'message' => 'Cheque registered successfully',
        ], 201);
    }

    public function deposit(Request $request, int $id): JsonResponse
    {
        $entry = ChequeRegistryEntry::find($id);

        if (!$entry) {
            return response()->json([
                'success' => false,
                'message' => 'Cheque registry entry not found',
            ], 404);
        }

        if ($entry->direction !== 'received') {
            return response()->json([
                'success' => false,
                'message' => 'Only received cheques can be deposited.',
            ], 422);
        }

        if ($entry->lifecycle_status === 'deposited' || $entry->lifecycle_status === 'cleared') {
            return response()->json([
                'success' => false,
                'message' => 'This cheque is already deposited.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'company_bank_account_id' => 'required|exists:company_bank_accounts,id',
            'deposit_date' => 'required|date',
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

        $updated = DB::transaction(function () use ($entry, $payload) {
            $bankAccount = CompanyBankAccount::findOrFail($payload['company_bank_account_id']);

            if ($entry->company_id && (int) $entry->company_id !== (int) $bankAccount->company_id) {
                throw new HttpResponseException(response()->json([
                    'success' => false,
                    'message' => 'Selected bank account does not belong to cheque company.',
                ], 422));
            }

            $entry->update([
                'company_id' => $bankAccount->company_id,
                'company_bank_account_id' => $bankAccount->id,
                'company_cheque_account_id' => null,
                'bank_name' => $bankAccount->bank_name,
                'account_no' => $bankAccount->account_no,
                'deposit_date' => $payload['deposit_date'],
                'lifecycle_status' => 'deposited',
                'notes' => $payload['notes'] ?? $entry->notes,
            ]);

            if (!empty($entry->distribution_payment_id)) {
                $payment = DistributionPayment::find($entry->distribution_payment_id);
                if ($payment && $payment->payment_method === 'check') {
                    // Keep distribution payment status unchanged at deposit stage.
                    // Final financial completion is tracked on end clearance.
                }
            }

            return $entry->fresh()->load(['company:id,name', 'bankAccount:id,company_id,bank_name,account_no,current_balance', 'chequeAccount:id,company_id,bank_name,account_no,current_balance']);
        });

        return response()->json([
            'success' => true,
            'data' => $updated,
            'message' => 'Cheque deposited successfully',
        ]);
    }

    public function returnCheque(Request $request, int $id): JsonResponse
    {
        $entry = ChequeRegistryEntry::find($id);

        if (!$entry) {
            return response()->json([
                'success' => false,
                'message' => 'Cheque registry entry not found',
            ], 404);
        }

        if ($entry->direction !== 'received') {
            return response()->json([
                'success' => false,
                'message' => 'Only received cheques can be returned.',
            ], 422);
        }

        if ($entry->lifecycle_status === 'bounced') {
            return response()->json([
                'success' => false,
                'message' => 'This cheque is already marked as returned.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
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

        $updated = DB::transaction(function () use ($entry, $payload, $request) {
            $amount = (float) $entry->amount;
            $wasDeposited = $entry->lifecycle_status === 'cleared';

            // If already deposited, reverse the credited bank balance before marking return.
            if ($wasDeposited && $amount > 0) {
                $bankAccount = null;

                if (!empty($entry->company_bank_account_id)) {
                    $bankAccount = CompanyBankAccount::query()
                        ->whereKey((int) $entry->company_bank_account_id)
                        ->first();
                }

                if (!$bankAccount && !empty($entry->company_id) && !empty($entry->account_no)) {
                    $bankAccount = CompanyBankAccount::query()
                        ->where('company_id', $entry->company_id)
                        ->where('account_no', $entry->account_no)
                        ->first();
                }

                if (!$bankAccount && !empty($entry->company_id) && !empty($entry->bank_name)) {
                    $bankAccount = CompanyBankAccount::query()
                        ->where('company_id', $entry->company_id)
                        ->where('bank_name', $entry->bank_name)
                        ->orderBy('id')
                        ->first();
                }

                if ($bankAccount) {
                    CompanyBankAccount::whereKey($bankAccount->id)
                        ->update(['current_balance' => DB::raw('GREATEST(current_balance - ' . $amount . ', 0)')]);

                    $company = Company::find($bankAccount->company_id);
                    if ($company) {
                        $companyBankBalance = (float) $company->bankAccounts()->sum('current_balance');
                        $company->update(['current_bank_balance' => round($companyBankBalance, 2)]);
                    }
                }
            }

            if (!empty($entry->distribution_payment_id)) {
                $payment = DistributionPayment::find($entry->distribution_payment_id);
                if ($payment && $payment->payment_method === 'check') {
                    $payment->update(['status' => 'bounced']);

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

                    $customer = DistributionCustomer::find($payment->customer_id);
                    if ($customer) {
                        $customer->outstanding = (float) ($customer->outstanding ?? 0) + (float) $payment->amount;
                        $customer->save();
                    }
                }
            }

            $existingNotes = trim((string) ($entry->notes ?? ''));
            $returnNote = trim((string) ($payload['notes'] ?? ''));
            $suffix = 'Cheque returned on ' . now()->toDateTimeString();
            $composed = trim(implode(' | ', array_filter([$existingNotes, $returnNote, $suffix])));

            $entry->update([
                'lifecycle_status' => 'bounced',
                'notes' => $composed !== '' ? $composed : null,
            ]);

            MainCashTransaction::create([
                'date' => now()->toDateString(),
                'type' => 'out',
                'amount' => $entry->amount,
                'reference' => 'CHQ-RET-' . $entry->id,
                'note' => 'Cheque return | Cheque: ' . $entry->cheque_no . ' | Source: ' . ($entry->source_module ?? 'manual') . ($wasDeposited ? ' | Reversed deposited cheque' : ' | Returned before deposit'),
                'created_by' => $request->user()?->id,
            ]);

            return $entry->fresh()->load(['company:id,name', 'bankAccount:id,company_id,bank_name,account_no,current_balance', 'chequeAccount:id,company_id,bank_name,account_no,current_balance']);
        });

        return response()->json([
            'success' => true,
            'data' => $updated,
            'message' => 'Cheque marked as returned successfully',
        ]);
    }

    public function endClearance(Request $request, int $id): JsonResponse
    {
        $entry = ChequeRegistryEntry::find($id);

        if (!$entry) {
            return response()->json([
                'success' => false,
                'message' => 'Cheque registry entry not found',
            ], 404);
        }

        if ($entry->direction !== 'received') {
            return response()->json([
                'success' => false,
                'message' => 'Only received cheques can be cleared.',
            ], 422);
        }

        if ($entry->lifecycle_status === 'cleared') {
            return response()->json([
                'success' => false,
                'message' => 'Cheque process is already cleared.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
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

        $updated = DB::transaction(function () use ($entry, $payload, $request) {
            $amount = (float) $entry->amount;
            $companyId = (int) ($entry->company_id ?? 0);

            if ($companyId <= 0) {
                throw new HttpResponseException(response()->json([
                    'success' => false,
                    'message' => 'Company is required to complete cheque clearance.',
                ], 422));
            }

            $bankAccount = null;

            if (!empty($entry->company_bank_account_id)) {
                $bankAccount = CompanyBankAccount::query()
                    ->whereKey((int) $entry->company_bank_account_id)
                    ->first();
            }

            if (!$bankAccount && !empty($entry->account_no)) {
                $bankAccount = CompanyBankAccount::query()
                    ->where('company_id', $companyId)
                    ->where('account_no', $entry->account_no)
                    ->first();
            }

            if (!$bankAccount && !empty($entry->bank_name)) {
                $bankAccount = CompanyBankAccount::query()
                    ->where('company_id', $companyId)
                    ->where('bank_name', $entry->bank_name)
                    ->orderBy('id')
                    ->first();
            }

            if (!$bankAccount) {
                $bankAccount = CompanyBankAccount::query()
                    ->where('company_id', $companyId)
                    ->orderBy('id')
                    ->first();
            }

            if (!$bankAccount) {
                throw new HttpResponseException(response()->json([
                    'success' => false,
                    'message' => 'No company bank account found for end clearance.',
                ], 422));
            }

            // Credit bank on end clearance (final settlement point).
            if ($entry->lifecycle_status !== 'cleared' && $amount > 0) {
                CompanyBankAccount::whereKey($bankAccount->id)
                    ->update(['current_balance' => DB::raw('current_balance + ' . $amount)]);
            }

            $company = Company::find($bankAccount->company_id);
            if ($company) {
                $companyBankBalance = (float) $company->bankAccounts()->sum('current_balance');
                $company->update(['current_bank_balance' => round($companyBankBalance, 2)]);
            }

            if (!empty($entry->distribution_payment_id)) {
                $payment = DistributionPayment::find($entry->distribution_payment_id);
                if ($payment && $payment->payment_method === 'check') {
                    $payment->update(['status' => 'cleared']);

                    if (!empty($payment->distribution_invoice_id)) {
                        $invoice = DistributionInvoice::find($payment->distribution_invoice_id);
                        if ($invoice) {
                            $nextPaidAmount = (float) $invoice->paid_amount;

                            // Re-apply payment amount if it was previously rolled back on cheque return.
                            if ((float) $payment->amount > 0 && $entry->lifecycle_status === 'bounced') {
                                $nextPaidAmount += (float) $payment->amount;
                            }

                            $invoice->paid_amount = max(0, $nextPaidAmount);

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

                    if ($entry->lifecycle_status === 'bounced') {
                        $customer = DistributionCustomer::find($payment->customer_id);
                        if ($customer) {
                            $customer->outstanding = max(0, (float) ($customer->outstanding ?? 0) - (float) $payment->amount);
                            $customer->save();
                        }
                    }
                }
            }

            $existingNotes = trim((string) ($entry->notes ?? ''));
            $clearanceNote = trim((string) ($payload['notes'] ?? ''));
            $suffix = 'End clearance completed on ' . now()->toDateTimeString();
            $composed = trim(implode(' | ', array_filter([$existingNotes, $clearanceNote, $suffix])));

            $entry->update([
                'company_id' => $bankAccount->company_id,
                'company_bank_account_id' => $bankAccount->id,
                'company_cheque_account_id' => null,
                'bank_name' => $bankAccount->bank_name,
                'account_no' => $bankAccount->account_no,
                'deposit_date' => $entry->deposit_date ?: now()->toDateString(),
                'lifecycle_status' => 'cleared',
                'notes' => $composed !== '' ? $composed : null,
            ]);

            MainCashTransaction::create([
                'date' => now()->toDateString(),
                'type' => 'in',
                'amount' => $entry->amount,
                'reference' => 'CHQ-ENDCLR-' . $entry->id,
                'note' => 'End cheque clearance | Cheque: ' . $entry->cheque_no . ' | Bank: ' . ($bankAccount->bank_name ?? '-') . ' | Source: ' . ($entry->source_module ?? 'manual'),
                'created_by' => $request->user()?->id,
            ]);

            return $entry->fresh()->load(['company:id,name', 'bankAccount:id,company_id,bank_name,account_no,current_balance', 'chequeAccount:id,company_id,bank_name,account_no,current_balance']);
        });

        return response()->json([
            'success' => true,
            'data' => $updated,
            'message' => 'Cheque end clearance completed successfully',
        ]);
    }

    public function issueCheque(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'company_id' => 'required|exists:companies,id',
            'company_cheque_account_id' => 'nullable|required_without:company_bank_account_id|exists:company_cheque_accounts,id',
            'company_bank_account_id' => 'nullable|required_without:company_cheque_account_id|exists:company_bank_accounts,id',
            'supplier_name' => 'required|string|max:255',
            'cheque_no' => 'required|string|max:100',
            'cheque_date' => 'required|date',
            'amount' => 'required|numeric|gt:0',
            'bank_name' => 'nullable|string|max:255',
            'account_no' => 'nullable|string|max:100',
            'reference_no' => 'nullable|string|max:100',
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

        $entry = DB::transaction(function () use ($payload, $request) {
            $amount = (float) $payload['amount'];
            $company = Company::findOrFail($payload['company_id']);
            $companyBankAccountId = null;
            $companyChequeAccountId = null;
            $bankName = $payload['bank_name'] ?? null;
            $accountNo = $payload['account_no'] ?? null;

            if (!empty($payload['company_bank_account_id'])) {
                $bankAccount = CompanyBankAccount::findOrFail($payload['company_bank_account_id']);

                if ((int) $bankAccount->company_id !== (int) $payload['company_id']) {
                    throw new HttpResponseException(response()->json([
                        'success' => false,
                        'message' => 'Bank account does not belong to selected company.',
                    ], 422));
                }

                $available = (float) $bankAccount->current_balance;
                if ($available < $amount) {
                    throw new HttpResponseException(response()->json([
                        'success' => false,
                        'message' => 'Insufficient company bank account balance.',
                    ], 422));
                }

                CompanyBankAccount::whereKey($bankAccount->id)
                    ->update(['current_balance' => DB::raw('current_balance - ' . $amount)]);

                $companyBankBalance = (float) $company->bankAccounts()->sum('current_balance');
                $company->update(['current_bank_balance' => round($companyBankBalance, 2)]);

                $companyBankAccountId = (int) $bankAccount->id;
                $bankName = $bankName ?? $bankAccount->bank_name;
                $accountNo = $accountNo ?? $bankAccount->account_no;
            } else {
                $chequeAccount = CompanyChequeAccount::findOrFail($payload['company_cheque_account_id']);

                if ((int) $chequeAccount->company_id !== (int) $payload['company_id']) {
                    throw new HttpResponseException(response()->json([
                        'success' => false,
                        'message' => 'Cheque account does not belong to selected company.',
                    ], 422));
                }

                $available = (float) $chequeAccount->current_balance;
                if ($available < $amount) {
                    throw new HttpResponseException(response()->json([
                        'success' => false,
                        'message' => 'Insufficient cheque account balance.',
                    ], 422));
                }

                CompanyChequeAccount::whereKey($chequeAccount->id)
                    ->update(['current_balance' => DB::raw('current_balance - ' . $amount)]);

                $companyChequeBalance = (float) $company->chequeAccounts()->sum('current_balance');
                $company->update(['current_cheque_balance' => round($companyChequeBalance, 2)]);

                $companyChequeAccountId = (int) $chequeAccount->id;
                $bankName = $bankName ?? $chequeAccount->bank_name;
                $accountNo = $accountNo ?? $chequeAccount->account_no;
            }

            return ChequeRegistryEntry::create([
                'company_id' => $payload['company_id'],
                'company_bank_account_id' => $companyBankAccountId,
                'company_cheque_account_id' => $companyChequeAccountId,
                'direction' => 'issued',
                'lifecycle_status' => 'issued',
                'source_module' => 'supplier_payment',
                'cheque_no' => $payload['cheque_no'],
                'cheque_date' => $payload['cheque_date'],
                'amount' => $payload['amount'],
                'bank_name' => $bankName,
                'account_no' => $accountNo,
                'counterparty_name' => $payload['supplier_name'],
                'reference_no' => $payload['reference_no'] ?? null,
                'notes' => $payload['notes'] ?? null,
                'created_by' => $request->user()?->id,
            ]);
        });

        return response()->json([
            'success' => true,
            'data' => $entry->load(['company:id,name', 'bankAccount:id,company_id,bank_name,account_no,current_balance', 'chequeAccount:id,company_id,bank_name,account_no,current_balance']),
            'message' => 'Issued cheque saved successfully',
        ], 201);
    }
}
