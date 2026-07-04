<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\CompanyBankAccount;
use App\Models\CompanyChequeAccount;
use App\Models\Employee;
use App\Models\Candidate;
use App\Models\Department;
use App\Models\Designation;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class CompanyController extends Controller
{
    public function index()
    {
        $companies = Company::with(['bankAccounts', 'chequeAccounts'])->get();
        return response()->json($companies);
    }

    public function show(Company $company)
    {
        return response()->json($company->load(['bankAccounts', 'chequeAccounts']));
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:companies',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'telephone' => 'nullable|string|max:20',
            'whatsapp_number' => 'nullable|string|max:20',
            'website' => 'nullable|url',
            'country' => 'nullable|string|max:100',
            'currency' => 'nullable|string|max:10',
            'current_cash_balance' => 'nullable|numeric|min:0',
            'current_bank_balance' => 'nullable|numeric|min:0',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_no' => 'nullable|string|max:100',
            'current_cheque_balance' => 'nullable|numeric|min:0',
            'bank_accounts' => 'nullable',
            'cheque_accounts' => 'nullable',
            'logo' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:2048',
        ]);

        $bankAccounts = $this->normalizeAccounts($request->input('bank_accounts'));
        $chequeAccounts = $this->normalizeAccounts($request->input('cheque_accounts'));

        if (!empty($request->input('bank_name')) || !empty($request->input('bank_account_no')) || $request->filled('current_bank_balance')) {
            $bankAccounts[] = [
                'bank_name' => (string) $request->input('bank_name', ''),
                'account_no' => (string) $request->input('bank_account_no', ''),
                'current_balance' => (float) $request->input('current_bank_balance', 0),
            ];
        }

        if (!empty($request->input('bank_name')) || !empty($request->input('bank_account_no')) || $request->filled('current_cheque_balance')) {
            $chequeAccounts[] = [
                'bank_name' => (string) $request->input('bank_name', ''),
                'account_no' => (string) $request->input('bank_account_no', ''),
                'current_balance' => (float) $request->input('current_cheque_balance', 0),
            ];
        }

        $bankAccounts = $this->validateAccountRows($bankAccounts, 'bank_accounts');
        $chequeAccounts = $this->validateAccountRows($chequeAccounts, 'cheque_accounts');

        $payload = $request->only([
            'name',
            'email',
            'address',
            'phone',
            'telephone',
            'whatsapp_number',
            'website',
            'country',
            'currency',
            'current_cash_balance',
            'current_bank_balance',
            'bank_name',
            'bank_account_no',
            'current_cheque_balance',
        ]);

        $payload['current_bank_balance'] = collect($bankAccounts)->sum('current_balance');
        $payload['current_cheque_balance'] = collect($chequeAccounts)->sum('current_balance');

        if (!empty($bankAccounts[0])) {
            $payload['bank_name'] = $bankAccounts[0]['bank_name'];
            $payload['bank_account_no'] = $bankAccounts[0]['account_no'];
        }

        if ($request->hasFile('logo')) {
            $payload['logo_path'] = $request->file('logo')->store('company-logos', 'public');
        }

        $company = DB::transaction(function () use ($payload, $bankAccounts, $chequeAccounts) {
            $company = Company::create($payload);

            foreach ($bankAccounts as $account) {
                CompanyBankAccount::create([
                    'company_id' => $company->id,
                    'bank_name' => $account['bank_name'],
                    'account_no' => $account['account_no'],
                    'current_balance' => $account['current_balance'],
                ]);
            }

            foreach ($chequeAccounts as $account) {
                CompanyChequeAccount::create([
                    'company_id' => $company->id,
                    'bank_name' => $account['bank_name'],
                    'account_no' => $account['account_no'],
                    'current_balance' => $account['current_balance'],
                ]);
            }

            return $company;
        });

        return response()->json($company->load(['bankAccounts', 'chequeAccounts']), 201);
    }

    public function update(Request $request, Company $company)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:companies,email,' . $company->id,
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'telephone' => 'nullable|string|max:20',
            'whatsapp_number' => 'nullable|string|max:20',
            'website' => 'nullable|url',
            'country' => 'nullable|string|max:100',
            'currency' => 'nullable|string|max:10',
            'current_cash_balance' => 'nullable|numeric|min:0',
            'current_bank_balance' => 'nullable|numeric|min:0',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_no' => 'nullable|string|max:100',
            'current_cheque_balance' => 'nullable|numeric|min:0',
            'bank_accounts' => 'nullable',
            'cheque_accounts' => 'nullable',
            'logo' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:2048',
        ]);

        $bankAccounts = $this->normalizeAccounts($request->input('bank_accounts'));
        $chequeAccounts = $this->normalizeAccounts($request->input('cheque_accounts'));

        if (empty($bankAccounts) && (!empty($request->input('bank_name')) || !empty($request->input('bank_account_no')) || $request->filled('current_bank_balance'))) {
            $bankAccounts[] = [
                'bank_name' => (string) $request->input('bank_name', ''),
                'account_no' => (string) $request->input('bank_account_no', ''),
                'current_balance' => (float) $request->input('current_bank_balance', 0),
            ];
        }

        if (empty($chequeAccounts) && (!empty($request->input('bank_name')) || !empty($request->input('bank_account_no')) || $request->filled('current_cheque_balance'))) {
            $chequeAccounts[] = [
                'bank_name' => (string) $request->input('bank_name', ''),
                'account_no' => (string) $request->input('bank_account_no', ''),
                'current_balance' => (float) $request->input('current_cheque_balance', 0),
            ];
        }

        $bankAccounts = $this->validateAccountRows($bankAccounts, 'bank_accounts');
        $chequeAccounts = $this->validateAccountRows($chequeAccounts, 'cheque_accounts');

        $payload = $request->only([
            'name',
            'email',
            'address',
            'phone',
            'telephone',
            'whatsapp_number',
            'website',
            'country',
            'currency',
            'current_cash_balance',
            'current_bank_balance',
            'bank_name',
            'bank_account_no',
            'current_cheque_balance',
        ]);

        $payload['current_bank_balance'] = collect($bankAccounts)->sum('current_balance');
        $payload['current_cheque_balance'] = collect($chequeAccounts)->sum('current_balance');

        if (!empty($bankAccounts[0])) {
            $payload['bank_name'] = $bankAccounts[0]['bank_name'];
            $payload['bank_account_no'] = $bankAccounts[0]['account_no'];
        }

        if ($request->hasFile('logo')) {
            if ($company->logo_path && Storage::disk('public')->exists($company->logo_path)) {
                Storage::disk('public')->delete($company->logo_path);
            }

            $payload['logo_path'] = $request->file('logo')->store('company-logos', 'public');
        }

        DB::transaction(function () use ($company, $payload, $bankAccounts, $chequeAccounts) {
            $company->update($payload);

            CompanyBankAccount::where('company_id', $company->id)->delete();
            foreach ($bankAccounts as $account) {
                CompanyBankAccount::create([
                    'company_id' => $company->id,
                    'bank_name' => $account['bank_name'],
                    'account_no' => $account['account_no'],
                    'current_balance' => $account['current_balance'],
                ]);
            }

            CompanyChequeAccount::where('company_id', $company->id)->delete();
            foreach ($chequeAccounts as $account) {
                CompanyChequeAccount::create([
                    'company_id' => $company->id,
                    'bank_name' => $account['bank_name'],
                    'account_no' => $account['account_no'],
                    'current_balance' => $account['current_balance'],
                ]);
            }
        });

        return response()->json($company->fresh()->load(['bankAccounts', 'chequeAccounts']));
    }

    private function normalizeAccounts(mixed $raw): array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }

        return is_array($raw) ? $raw : [];
    }

    private function validateAccountRows(array $rows, string $prefix): array
    {
        $validatedRows = [];

        foreach ($rows as $index => $row) {
            $row = is_array($row) ? $row : [];

            $bankName = trim((string) ($row['bank_name'] ?? ''));
            $accountNo = trim((string) ($row['account_no'] ?? ''));
            $currentBalance = (float) ($row['current_balance'] ?? 0);

            if ($bankName === '' && $accountNo === '' && $currentBalance <= 0) {
                continue;
            }

            $validator = Validator::make($row, [
                'bank_name' => 'required|string|max:255',
                'account_no' => 'required|string|max:100',
                'current_balance' => 'nullable|numeric|min:0',
            ]);

            if ($validator->fails()) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        "{$prefix}.{$index}" => $validator->errors()->all(),
                    ],
                ], 422));
            }

            $validatedRows[] = [
                'bank_name' => $bankName,
                'account_no' => $accountNo,
                'current_balance' => max(0, $currentBalance),
            ];
        }

        return $validatedRows;
    }

    public function destroy(Company $company)
    {
        // Check if company is referenced in other tables
        $hasEmployees = Employee::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();
        $hasCandidates = Candidate::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();
        $hasDepartments = Department::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();
        $hasDesignations = Designation::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();

        if ($hasEmployees || $hasCandidates || $hasDepartments || $hasDesignations) {
            return response()->json(['error' => 'Cannot delete company because it is referenced by other records.'], 422);
        }

        $company->delete();
        return response()->json(['message' => 'Company deleted successfully']);
    }
}
