<?php

namespace App\Http\Controllers;

use App\Models\AdvancePayment;
use App\Models\Company;
use App\Models\CompanyBankAccount;
use App\Models\MainCashTransaction;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AdvancePaymentController extends Controller
{
    private const TYPE_LABEL_MAP = [
        'supplier_advance' => 'Supplier Advance Account',
        'employee_advance' => 'Employee Advance Account',
        'travel_advance' => 'Travel Advance Account',
        'contractor_advance' => 'Contractor Advance Account',
        'rent_advance' => 'Rent Advance Account',
        'insurance_advance' => 'Insurance Advance Account',
        'utility_deposit' => 'Utility Deposit Account',
        'customer_advance' => 'Customer Advance Liability Account',
    ];

    private const TYPE_CLASSIFICATION_MAP = [
        'supplier_advance' => 'current_asset',
        'employee_advance' => 'current_asset',
        'travel_advance' => 'current_asset',
        'contractor_advance' => 'current_asset',
        'rent_advance' => 'prepaid_asset',
        'insurance_advance' => 'prepaid_asset',
        'utility_deposit' => 'deposit_asset',
        'customer_advance' => 'liability',
    ];

    private const TYPE_ENTRY_MAP = [
        'supplier_advance' => 'out',
        'employee_advance' => 'out',
        'travel_advance' => 'out',
        'contractor_advance' => 'out',
        'rent_advance' => 'out',
        'insurance_advance' => 'out',
        'utility_deposit' => 'out',
        'customer_advance' => 'in',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = AdvancePayment::query()
            ->with([
                'company:id,name',
                'companyBankAccount:id,company_id,bank_name,account_no',
            ]);

        if ($request->filled('advance_type')) {
            $query->where('advance_type', $request->string('advance_type'));
        }

        if ($request->filled('entry_type')) {
            $query->where('entry_type', $request->string('entry_type'));
        }

        if ($request->filled('accounting_classification')) {
            $query->where('accounting_classification', $request->string('accounting_classification'));
        }

        if ($request->filled('search')) {
            $term = $request->string('search');
            $query->where(function ($builder) use ($term) {
                $builder->where('beneficiary_name', 'like', "%{$term}%")
                    ->orWhere('reference', 'like', "%{$term}%")
                    ->orWhere('note', 'like', "%{$term}%");
            });
        }

        $records = $query
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 100));

        return response()->json([
            'success' => true,
            'data' => $records,
            'message' => 'Advance payments retrieved successfully.',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'date' => 'required|date',
            'advance_type' => 'required|in:supplier_advance,employee_advance,travel_advance,contractor_advance,rent_advance,insurance_advance,utility_deposit,customer_advance',
            'amount' => 'required|numeric|gt:0',
            'beneficiary_name' => 'required|string|max:255',
            'payment_method' => 'required|in:cash,bank_transfer,cheque,card,other',
            'company_id' => 'nullable|exists:companies,id',
            'company_bank_account_id' => 'nullable|exists:company_bank_accounts,id',
            'reference' => 'nullable|string|max:120',
            'note' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $advanceType = $payload['advance_type'];
        $classification = self::TYPE_CLASSIFICATION_MAP[$advanceType];
        $entryType = self::TYPE_ENTRY_MAP[$advanceType];

        if ($payload['payment_method'] === 'bank_transfer' && empty($payload['company_bank_account_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'Company bank account is required for bank transfer payments.',
            ], 422);
        }

        $resolvedCompanyId = (int) ($payload['company_id'] ?? 0);
        if ($resolvedCompanyId <= 0) {
            $resolvedCompanyId = (int) Company::query()->orderBy('id')->value('id');
        }

        if ($resolvedCompanyId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'No company found to post this advance entry.',
            ], 422);
        }

        try {
            $record = DB::transaction(function () use ($payload, $advanceType, $classification, $entryType, $request, $resolvedCompanyId) {
                $amount = (float) $payload['amount'];
                $company = Company::query()->lockForUpdate()->find($resolvedCompanyId);
                if (!$company) {
                    throw new HttpResponseException(response()->json([
                        'success' => false,
                        'message' => 'Selected company not found.',
                    ], 422));
                }

                $bankAccount = null;
                if ($payload['payment_method'] === 'bank_transfer') {
                    $bankAccount = CompanyBankAccount::query()
                        ->whereKey((int) $payload['company_bank_account_id'])
                        ->where('company_id', $company->id)
                        ->lockForUpdate()
                        ->first();

                    if (!$bankAccount) {
                        throw new HttpResponseException(response()->json([
                            'success' => false,
                            'message' => 'Selected bank account does not belong to the selected company.',
                        ], 422));
                    }

                    $bankBalance = (float) $bankAccount->current_balance;
                    if ($entryType === 'out' && $bankBalance < $amount) {
                        throw new HttpResponseException(response()->json([
                            'success' => false,
                            'message' => 'Insufficient company bank balance for this advance payment.',
                        ], 422));
                    }

                    $nextBalance = $entryType === 'out' ? $bankBalance - $amount : $bankBalance + $amount;
                    $bankAccount->update([
                        'current_balance' => $nextBalance,
                    ]);

                    $totalBankBalance = (float) CompanyBankAccount::query()
                        ->where('company_id', $company->id)
                        ->sum('current_balance');

                    $firstBankAccount = CompanyBankAccount::query()
                        ->where('company_id', $company->id)
                        ->orderBy('id')
                        ->first();

                    $company->update([
                        'current_bank_balance' => max(0, $totalBankBalance),
                        'bank_name' => $firstBankAccount?->bank_name,
                        'bank_account_no' => $firstBankAccount?->account_no,
                    ]);
                } else {
                    $cashBalance = (float) $company->current_cash_balance;
                    if ($entryType === 'out' && $cashBalance < $amount) {
                        throw new HttpResponseException(response()->json([
                            'success' => false,
                            'message' => 'Insufficient company cash balance for this advance payment.',
                        ], 422));
                    }

                    $nextCashBalance = $entryType === 'out' ? $cashBalance - $amount : $cashBalance + $amount;
                    $company->update([
                        'current_cash_balance' => max(0, $nextCashBalance),
                    ]);
                }

                $journalReference = trim((string) ($payload['reference'] ?? '')) ?: ('ADV-' . now()->format('YmdHis'));
                $journalNote = $this->buildJournalNote(
                    $advanceType,
                    $entryType,
                    $payload['beneficiary_name'],
                    $payload['payment_method'],
                    $bankAccount,
                    $payload['note'] ?? null
                );

                $mainCashTransaction = MainCashTransaction::create([
                    'date' => $payload['date'],
                    'type' => $entryType,
                    'amount' => $amount,
                    'reference' => $journalReference,
                    'note' => $journalNote,
                    'created_by' => $request->user()?->id,
                ]);

                return AdvancePayment::create([
                    'date' => $payload['date'],
                    'advance_type' => $advanceType,
                    'accounting_classification' => $classification,
                    'entry_type' => $entryType,
                    'amount' => $amount,
                    'beneficiary_name' => $payload['beneficiary_name'],
                    'payment_method' => $payload['payment_method'],
                    'company_id' => $company->id,
                    'company_bank_account_id' => $payload['payment_method'] === 'bank_transfer' ? $bankAccount?->id : null,
                    'main_cash_transaction_id' => $mainCashTransaction->id,
                    'reference' => $payload['reference'] ?? $journalReference,
                    'note' => $payload['note'] ?? null,
                    'created_by' => $request->user()?->id,
                ]);
            });
        } catch (HttpResponseException $e) {
            throw $e;
        }

        $record->load([
            'company:id,name',
            'companyBankAccount:id,company_id,bank_name,account_no',
        ]);

        return response()->json([
            'success' => true,
            'data' => $record,
            'message' => 'Advance payment recorded successfully.',
        ], 201);
    }

    public function destroy(string $id): JsonResponse
    {
        $record = AdvancePayment::find($id);
        if (!$record) {
            return response()->json([
                'success' => false,
                'message' => 'Advance payment record not found.',
            ], 404);
        }

        DB::transaction(function () use ($record) {
            $amount = (float) $record->amount;
            $companyId = (int) ($record->company_id ?? 0);

            if ($companyId > 0) {
                $company = Company::query()->lockForUpdate()->find($companyId);
                if ($company) {
                    if ($record->payment_method === 'bank_transfer') {
                        $bankAccountId = (int) ($record->company_bank_account_id ?? 0);
                        $bankAccount = CompanyBankAccount::query()
                            ->where('company_id', $company->id)
                            ->whereKey($bankAccountId)
                            ->lockForUpdate()
                            ->first();

                        if (!$bankAccount) {
                            throw new HttpResponseException(response()->json([
                                'success' => false,
                                'message' => 'Linked company bank account was not found to reverse this advance payment.',
                            ], 422));
                        }

                        $currentBankBalance = (float) $bankAccount->current_balance;
                        $reversedBalance = $record->entry_type === 'out'
                            ? $currentBankBalance + $amount
                            : $currentBankBalance - $amount;

                        if ($reversedBalance < 0) {
                            throw new HttpResponseException(response()->json([
                                'success' => false,
                                'message' => 'Cannot reverse this bank advance payment because bank balance would be negative.',
                            ], 422));
                        }

                        $bankAccount->update([
                            'current_balance' => $reversedBalance,
                        ]);

                        $totalBankBalance = (float) CompanyBankAccount::query()
                            ->where('company_id', $company->id)
                            ->sum('current_balance');

                        $firstBankAccount = CompanyBankAccount::query()
                            ->where('company_id', $company->id)
                            ->orderBy('id')
                            ->first();

                        $company->update([
                            'current_bank_balance' => max(0, $totalBankBalance),
                            'bank_name' => $firstBankAccount?->bank_name,
                            'bank_account_no' => $firstBankAccount?->account_no,
                        ]);
                    } else {
                        $currentCashBalance = (float) $company->current_cash_balance;
                        $reversedCashBalance = $record->entry_type === 'out'
                            ? $currentCashBalance + $amount
                            : $currentCashBalance - $amount;

                        if ($reversedCashBalance < 0) {
                            throw new HttpResponseException(response()->json([
                                'success' => false,
                                'message' => 'Cannot reverse this cash advance payment because cash balance would be negative.',
                            ], 422));
                        }

                        $company->update([
                            'current_cash_balance' => max(0, $reversedCashBalance),
                        ]);
                    }
                }
            }

            if (!empty($record->main_cash_transaction_id)) {
                MainCashTransaction::query()->whereKey((int) $record->main_cash_transaction_id)->delete();
            }

            $record->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Advance payment record deleted successfully.',
        ]);
    }

    private function buildJournalNote(
        string $advanceType,
        string $entryType,
        string $beneficiaryName,
        string $paymentMethod,
        ?CompanyBankAccount $bankAccount,
        ?string $userNote
    ): string {
        $beneficiary = trim($beneficiaryName) !== '' ? trim($beneficiaryName) : 'party';
        $advanceLabel = self::TYPE_LABEL_MAP[$advanceType] ?? 'Advance Account';

        $paymentAccount = 'Main Cash Account';
        if ($paymentMethod === 'bank_transfer' && $bankAccount) {
            $paymentAccount = sprintf(
                'Bank - %s (A/C: %s)',
                trim((string) $bankAccount->bank_name),
                trim((string) $bankAccount->account_no)
            );
        }

        if ($entryType === 'out') {
            $base = sprintf(
                'Transfer issued for advance payment to %s. Dr %s, Cr %s.',
                $beneficiary,
                $advanceLabel,
                $paymentAccount
            );
        } else {
            $base = sprintf(
                'Transfer received for advance payment from %s. Dr %s, Cr %s.',
                $beneficiary,
                $paymentAccount,
                $advanceLabel
            );
        }

        $note = trim((string) $userNote);
        if ($note !== '') {
            return $base . ' Note: ' . $note;
        }

        return $base;
    }
}

