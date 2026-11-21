<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeWallet;
use App\Models\User;
use App\Models\Designation;
use App\Models\Role;
use App\Http\Requests\StoreEmployeeRequest;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;

class EmployeeController extends Controller
{
    private function generateEmployeeWalletNumber(Employee $employee): string
    {
        $baseCode = trim((string) ($employee->employee_code ?? 'EMP' . $employee->id));
        $safeBase = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $baseCode) ?: ('EMP' . $employee->id));
        $suffix = strtoupper(substr(md5((string) (microtime(true) . '-' . $employee->id)), 0, 4));
        $candidate = 'EW-' . $safeBase . '-' . $suffix;

        while (EmployeeWallet::query()->where('wallet_number', $candidate)->exists()) {
            $suffix = strtoupper(substr(md5((string) (microtime(true) . '-' . random_int(100, 999))), 0, 4));
            $candidate = 'EW-' . $safeBase . '-' . $suffix;
        }

        return $candidate;
    }

    private function generateTemporaryNicPassport(): string
    {
        $candidate = 'TEMP' . now()->format('YmdHis') . random_int(100, 999);

        while (Employee::withTrashed()->where('nic_passport', $candidate)->exists()) {
            $candidate = 'TEMP' . now()->format('YmdHis') . random_int(100, 999);
        }

        return $candidate;
    }

    private function generateEmployeeCode(): string
    {
        $maxNumeric = (int) (Employee::withTrashed()
            ->whereRaw("employee_code REGEXP '^EMP[0-9]+$'")
            ->selectRaw("MAX(CAST(SUBSTRING(employee_code, 4) AS UNSIGNED)) as max_code")
            ->value('max_code') ?? 0);

        $nextNumber = max(1, $maxNumeric + 1);
        $candidate = 'EMP' . str_pad((string) $nextNumber, 4, '0', STR_PAD_LEFT);

        // Keep incrementing if historical data already consumed the candidate.
        while (Employee::withTrashed()->where('employee_code', $candidate)->exists()) {
            $nextNumber++;
            $candidate = 'EMP' . str_pad((string) $nextNumber, 4, '0', STR_PAD_LEFT);
        }

        return $candidate;
    }

    private function calculateApit(float $monthlyIncome): array
    {
        $slabs = [
            ['limit' => 100000.00, 'rate' => 0.00],
            ['limit' => 141667.00, 'rate' => 0.06],
            ['limit' => 183333.00, 'rate' => 0.12],
            ['limit' => 225000.00, 'rate' => 0.18],
            ['limit' => 266667.00, 'rate' => 0.24],
            ['limit' => 308333.00, 'rate' => 0.30],
            ['limit' => INF, 'rate' => 0.36],
        ];

        $remaining = max(0.0, $monthlyIncome);
        $previousLimit = 0.0;
        $taxAmount = 0.0;
        $marginalRate = 0.0;

        foreach ($slabs as $slab) {
            if ($remaining <= 0.0) {
                break;
            }

            $currentLimit = (float) $slab['limit'];
            $rate = (float) $slab['rate'];
            $slabRange = is_infinite($currentLimit) ? $remaining : max(0.0, $currentLimit - $previousLimit);
            $taxable = min($remaining, $slabRange);

            if ($taxable > 0) {
                $taxAmount += $taxable * $rate;
                if ($rate > 0) {
                    $marginalRate = $rate * 100;
                }
            }

            $remaining -= $taxable;
            $previousLimit = $currentLimit;
        }

        return [
            'amount' => round($taxAmount, 2),
            'rate' => round($marginalRate, 2),
        ];
    }

    private function resolveRoleFromName(string $roleName): Role
    {
        $normalizedName = trim($roleName);

        $existingRole = Role::query()
            ->whereRaw('LOWER(name) = ?', [strtolower($normalizedName)])
            ->first();

        if ($existingRole) {
            return $existingRole;
        }

        return Role::create([
            'name' => $normalizedName,
            'description' => 'Auto-created from employee designation',
            'is_active' => true,
        ]);
    }

    private function syncUserRole(User $user, Role $role, ?int $assignedByUserId = null): void
    {
        $assignedBy = $assignedByUserId ?: $user->id;

        $user->roles()->sync([
            $role->id => [
                'assigned_at' => now(),
                'assigned_by' => $assignedBy,
            ],
        ]);
    }

    private function resolveDesignationId(?int $designationId, ?string $designationName, int $branchId): ?int
    {
        if ($designationId && $designationId > 0) {
            return $designationId;
        }

        $normalizedName = trim((string) $designationName);
        if ($normalizedName === '') {
            return null;
        }

        $existingDesignation = Designation::query()
            ->whereRaw('LOWER(name) = ?', [strtolower($normalizedName)])
            ->first();

        if ($existingDesignation) {
            return (int) $existingDesignation->id;
        }

        $designation = Designation::create([
            'tenant_id' => $branchId,
            'branch_id' => $branchId,
            'name' => $normalizedName,
            'description' => 'Auto-created from role selection',
            'is_active' => true,
        ]);

        return (int) $designation->id;
    }

    private function defaultPaymentRequestTypeForEmployeeType(string $employeeType): string
    {
        return in_array($employeeType, ['temporary', 'daily_wage'], true)
            ? 'daily_wage_request'
            : 'monthly_payroll';
    }

    private function isPaymentRequestTypeCompatible(string $employeeType, string $paymentRequestType): bool
    {
        $allowedByType = [
            'full_time' => ['monthly_payroll', 'salary_advance_request'],
            'part_time' => ['weekly_payroll', 'monthly_payroll', 'salary_advance_request'],
            'contract' => ['monthly_payroll', 'weekly_payroll', 'salary_advance_request'],
            'temporary' => ['daily_wage_request', 'daily_payroll', 'weekly_payroll'],
            'daily_wage' => ['daily_wage_request', 'daily_payroll'],
        ];

        $allowed = $allowedByType[$employeeType] ?? ['monthly_payroll'];

        return in_array($paymentRequestType, $allowed, true);
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Employee::with([
            'department',
            'designation',
            'branch',
            'user:id,employee_id,role,email,name',
            'wallet:id,employee_id,wallet_number,wallet_name,balance,currency,status',
            'reportingPerson:id,employee_code,first_name,last_name',
        ]);

        // Filter by authenticated user's tenant/branch if available
        $user = $request->user();
        if ($user && $user->branch_id) {
            $query->where('branch_id', $user->branch_id);
        }

        $employees = $query->get();

        return response()->json($employees);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $designationId = $this->resolveDesignationId(
            isset($validated['designation_id']) ? (int) $validated['designation_id'] : null,
            $validated['designation_name'] ?? null,
            (int) $validated['branch_id']
        );

        if (!$designationId) {
            return response()->json(['message' => 'Designation is required.'], 422);
        }

        // Set default values for required fields
        $taxApplicable = isset($validated['tax_applicable']) ? (bool) $validated['tax_applicable'] : false;
        $apit = $taxApplicable
            ? $this->calculateApit((float) $validated['basic_salary'])
            : ['amount' => 0.0, 'rate' => 0.0];
        $employeeType = $validated['employee_type'] ?? 'full_time';
        $paymentRequestType = $validated['payment_request_type'] ?? $this->defaultPaymentRequestTypeForEmployeeType($employeeType);

        if (!$this->isPaymentRequestTypeCompatible($employeeType, $paymentRequestType)) {
            return response()->json([
                'message' => 'Selected payment request type is not compatible with the selected employment type.',
            ], 422);
        }

        $employeeData = [
            'tenant_id' => (int) $validated['branch_id'],
            'branch_id' => $validated['branch_id'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'employee_nic' => $validated['employee_nic'] ?? null,
            'email' => $validated['email'],
            'mobile' => $validated['phone'] ?? '',
            'nic_passport' => $this->generateTemporaryNicPassport(),
            'address' => $validated['address'] ?? '',
            'photo_path' => $validated['photo_path'] ?? null,
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'gender' => 'other', // Default gender
            'department_id' => $validated['department_id'],
            'designation_id' => $designationId,
            'reporting_person_id' => $validated['reporting_person_id'] ?? null,
            'join_date' => $validated['hire_date'],
            'basic_salary' => $validated['basic_salary'],
            'commission' => $validated['commission'] ?? null,
            'commission_base' => $validated['commission_base'] ?? null,
            'overtime_payment_per_hour' => $validated['overtime_payment_per_hour'] ?? null,
            'deduction_late_hour' => $validated['deduction_late_hour'] ?? null,
            'epf_employee_contribution' => $validated['epf_employee_contribution'] ?? null,
            'epf_employer_contribution' => $validated['epf_employer_contribution'] ?? null,
            'etf_employee_contribution' => $validated['etf_employee_contribution'] ?? null,
            'etf_employer_contribution' => $validated['etf_employer_contribution'] ?? null,
            'tin' => $validated['tin'] ?? null,
            'tax_applicable' => $taxApplicable,
            'tax_relief_eligible' => isset($validated['tax_relief_eligible']) ? (bool) $validated['tax_relief_eligible'] : false,
            'apit_tax_amount' => $apit['amount'],
            'apit_tax_rate' => $apit['rate'],
            'employee_type' => $employeeType,
            'payment_request_type' => $paymentRequestType,
            'status' => $validated['status'] ?? 'active',
        ];

        // Generate collision-safe employee code for mixed historical formats.
        $employeeData['employee_code'] = $this->generateEmployeeCode();

        $employee = Employee::create($employeeData);

        // Create user account for the employee
        $employee->load('designation');
        $designationName = $employee->designation?->name;
        $userRole = $designationName ?: 'employee';

        $employeeUser = User::create([
            'name' => $validated['first_name'] . ' ' . $validated['last_name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $userRole,
            'employee_id' => $employee->id,
            'branch_id' => $validated['branch_id'],
        ]);

        $role = $this->resolveRoleFromName($userRole);
        $this->syncUserRole($employeeUser, $role, $request->user()?->id);

        return response()->json($employee->load([
            'department',
            'designation',
            'branch',
            'user:id,employee_id,role,email,name',
            'wallet:id,employee_id,wallet_number,wallet_name,balance,currency,status',
            'reportingPerson:id,employee_code,first_name,last_name',
        ]), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Employee $employee): JsonResponse
    {
        return response()->json($employee->load([
            'department',
            'designation',
            'branch',
            'user:id,employee_id,role,email,name',
            'wallet:id,employee_id,wallet_number,wallet_name,balance,currency,status',
            'reportingPerson:id,employee_code,first_name,last_name',
        ]));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => 'sometimes|required|string|max:255',
            'last_name' => 'sometimes|required|string|max:255',
            'employee_nic' => 'nullable|string|max:50|unique:employees,employee_nic,' . $employee->id,
            'email' => 'sometimes|required|email|unique:employees,email,' . $employee->id,
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'date_of_birth' => 'nullable|date|before:today',
            'hire_date' => 'sometimes|required|date',
            'employee_type' => 'nullable|in:full_time,part_time,contract,temporary,daily_wage',
            'payment_request_type' => 'nullable|in:monthly_payroll,weekly_payroll,daily_payroll,daily_wage_request,salary_advance_request',
            'basic_salary' => 'sometimes|required|numeric|min:0',
            'commission' => 'nullable|numeric|min:0|max:100',
            'commission_base' => 'nullable|in:company_profit,own_business',
            'overtime_payment_per_hour' => 'nullable|numeric|min:0',
            'deduction_late_hour' => 'nullable|numeric|min:0',
            'epf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'epf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'tin' => 'nullable|string|max:100',
            'tax_applicable' => 'nullable|boolean',
            'tax_relief_eligible' => 'nullable|boolean',
            'department_id' => 'sometimes|required|exists:departments,id',
            'designation_id' => 'nullable|required_without:designation_name|exists:designations,id',
            'designation_name' => 'nullable|required_without:designation_id|string|max:255',
            'reporting_person_id' => 'nullable|exists:employees,id',
            'branch_id' => 'sometimes|required|exists:companies,id',
            'status' => 'in:active,inactive,resigned',
            'resigned_at' => 'nullable|date',
            'resignation_reason' => 'nullable|string',
        ]);

        if (array_key_exists('reporting_person_id', $validated)) {
            $reportingPersonId = $validated['reporting_person_id'];
            if ((int) $reportingPersonId === (int) $employee->id) {
                return response()->json(['message' => 'Employee cannot report to themselves.'], 422);
            }
        }

        $targetBranchId = isset($validated['branch_id']) ? (int) $validated['branch_id'] : (int) $employee->branch_id;
        $designationId = $this->resolveDesignationId(
            isset($validated['designation_id']) ? (int) $validated['designation_id'] : null,
            $validated['designation_name'] ?? null,
            $targetBranchId
        );

        $resolvedSalary = isset($validated['basic_salary']) ? (float) $validated['basic_salary'] : (float) $employee->basic_salary;
        $resolvedTaxApplicable = array_key_exists('tax_applicable', $validated)
            ? (bool) $validated['tax_applicable']
            : (bool) $employee->tax_applicable;
        $apit = $resolvedTaxApplicable
            ? $this->calculateApit($resolvedSalary)
            : ['amount' => 0.0, 'rate' => 0.0];
        $resolvedEmployeeType = $validated['employee_type'] ?? ($employee->employee_type ?? 'full_time');
        $resolvedPaymentRequestType = $validated['payment_request_type']
            ?? ($employee->payment_request_type ?: $this->defaultPaymentRequestTypeForEmployeeType($resolvedEmployeeType));

        if (!$this->isPaymentRequestTypeCompatible($resolvedEmployeeType, $resolvedPaymentRequestType)) {
            return response()->json([
                'message' => 'Selected payment request type is not compatible with the selected employment type.',
            ], 422);
        }

        // Map frontend fields to backend fields
        $updateData = [
            'first_name' => $validated['first_name'] ?? $employee->first_name,
            'last_name' => $validated['last_name'] ?? $employee->last_name,
            'employee_nic' => array_key_exists('employee_nic', $validated)
                ? ($validated['employee_nic'] ?: null)
                : $employee->employee_nic,
            'email' => $validated['email'] ?? $employee->email,
            'mobile' => $validated['phone'] ?? $employee->mobile,
            'address' => $validated['address'] ?? $employee->address,
            'date_of_birth' => $validated['date_of_birth'] ?? $employee->date_of_birth,
            'department_id' => $validated['department_id'] ?? $employee->department_id,
            'designation_id' => $designationId ?? $employee->designation_id,
            'reporting_person_id' => array_key_exists('reporting_person_id', $validated)
                ? $validated['reporting_person_id']
                : $employee->reporting_person_id,
            'branch_id' => $validated['branch_id'] ?? $employee->branch_id,
            'join_date' => $validated['hire_date'] ?? $employee->join_date,
            'employee_type' => $resolvedEmployeeType,
            'payment_request_type' => $resolvedPaymentRequestType,
            'basic_salary' => $validated['basic_salary'] ?? $employee->basic_salary,
            'commission' => $validated['commission'] ?? $employee->commission,
            'commission_base' => $validated['commission_base'] ?? $employee->commission_base,
            'overtime_payment_per_hour' => $validated['overtime_payment_per_hour'] ?? $employee->overtime_payment_per_hour,
            'deduction_late_hour' => $validated['deduction_late_hour'] ?? $employee->deduction_late_hour,
            'epf_employee_contribution' => $validated['epf_employee_contribution'] ?? $employee->epf_employee_contribution,
            'epf_employer_contribution' => $validated['epf_employer_contribution'] ?? $employee->epf_employer_contribution,
            'etf_employee_contribution' => $validated['etf_employee_contribution'] ?? $employee->etf_employee_contribution,
            'etf_employer_contribution' => $validated['etf_employer_contribution'] ?? $employee->etf_employer_contribution,
            'tin' => $validated['tin'] ?? $employee->tin,
            'tax_applicable' => $resolvedTaxApplicable,
            'tax_relief_eligible' => array_key_exists('tax_relief_eligible', $validated)
                ? (bool) $validated['tax_relief_eligible']
                : (bool) $employee->tax_relief_eligible,
            'apit_tax_amount' => $apit['amount'],
            'apit_tax_rate' => $apit['rate'],
            'status' => $validated['status'] ?? $employee->status,
            'resigned_at' => $validated['resigned_at'] ?? $employee->resigned_at,
            'resignation_reason' => $validated['resignation_reason'] ?? $employee->resignation_reason,
        ];

        $employee->update($updateData);

        // Keep linked user role in sync with designation
        $employee->load('designation');
        $employeeUser = User::where('employee_id', $employee->id)->first();
        if ($employeeUser && $employee->designation) {
            $employeeUser->update(['role' => $employee->designation->name]);

            $role = $this->resolveRoleFromName($employee->designation->name);
            $this->syncUserRole($employeeUser, $role, $request->user()?->id);
        }

        return response()->json($employee->load([
            'department',
            'designation',
            'branch',
            'user:id,employee_id,role,email,name',
            'wallet:id,employee_id,wallet_number,wallet_name,balance,currency,status',
            'reportingPerson:id,employee_code,first_name,last_name',
        ]));
    }

    public function resign(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'resigned_at' => 'nullable|date',
            'resignation_reason' => 'nullable|string|max:2000',
        ]);

        $employee->update([
            'status' => 'resigned',
            'resigned_at' => $validated['resigned_at'] ?? now()->toDateString(),
            'resignation_reason' => $validated['resignation_reason'] ?? null,
        ]);

        return response()->json([
            'message' => 'Employee marked as resigned successfully.',
            'employee' => $employee->fresh()->load(['department', 'designation', 'branch']),
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Employee $employee): JsonResponse
    {
        $employee->delete();

        return response()->json(['message' => 'Employee deleted successfully']);
    }

    public function resetPassword(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::where('employee_id', $employee->id)->first();
        if (!$user) {
            return response()->json([
                'message' => 'No linked user account found for this employee.',
            ], 404);
        }

        $user->password = Hash::make($validated['password']);
        $user->save();

        return response()->json([
            'message' => 'Employee password reset successfully.',
        ]);
    }

    public function createWallet(Request $request, Employee $employee): JsonResponse
    {
        if ($employee->status !== 'active') {
            return response()->json([
                'message' => 'Wallet can only be created for active employees.',
            ], 422);
        }

        if (EmployeeWallet::query()->where('employee_id', $employee->id)->exists()) {
            return response()->json([
                'message' => 'Wallet already exists for this employee.',
                'data' => EmployeeWallet::query()
                    ->where('employee_id', $employee->id)
                    ->first(['id', 'employee_id', 'wallet_number', 'wallet_name', 'balance', 'currency', 'status']),
            ], 422);
        }

        $validated = $request->validate([
            'wallet_name' => 'nullable|string|max:120',
            'opening_balance' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:10',
        ]);

        $walletName = trim((string) ($validated['wallet_name'] ?? ''));
        $wallet = EmployeeWallet::create([
            'employee_id' => $employee->id,
            'wallet_number' => $this->generateEmployeeWalletNumber($employee),
            'wallet_name' => $walletName !== '' ? $walletName : ($employee->first_name . ' ' . $employee->last_name . ' Wallet'),
            'balance' => (float) ($validated['opening_balance'] ?? 0),
            'currency' => strtoupper(trim((string) ($validated['currency'] ?? 'LKR'))) ?: 'LKR',
            'status' => 'active',
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'message' => 'Employee wallet created successfully.',
            'data' => $wallet->only(['id', 'employee_id', 'wallet_number', 'wallet_name', 'balance', 'currency', 'status']),
        ], 201);
    }
}
