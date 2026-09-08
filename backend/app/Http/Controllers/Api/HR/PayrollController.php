<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Payroll;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\Company;
use App\Models\EmployeeAllowanceDeduction;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;
use Barryvdh\DomPDF\Facade\Pdf;
use Symfony\Component\HttpFoundation\Response;

class PayrollController extends Controller
{
    private const STANDARD_DAILY_WORK_HOURS = 8;
    private ?array $payrollColumns = null;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');
        $monthYear = $request->input('month_year');

        $query = Payroll::with(['employee.department', 'employee.designation']);

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($monthYear) {
            $query->where('month_year', $monthYear);
        }

        $payrolls = $query->paginate(15);
        $payrolls->getCollection()->transform(function (Payroll $payroll) {
            return $this->appendBreakdown($payroll);
        });

        return response()->json($payrolls);
    }

    /**
     * Generate payroll for a specific month
     */
    public function generate(Request $request): JsonResponse
    {
        $request->validate([
            'branch_id' => 'nullable|exists:companies,id',
            'month_year' => 'required|date_format:Y-m',
        ]);

        $user = $request->user();
        $companyIds = Company::pluck('id')->map(fn ($id) => (int) $id)->values();
        $branchId = $this->firstValidCompanyId($companyIds, [
            $request->branch_id,
            $user?->branch_id,
            $user?->employee?->branch_id,
            $companyIds->first(),
        ]);
        $tenantId = $this->firstValidCompanyId($companyIds, [
            $user?->employee?->tenant_id,
            $branchId,
            $companyIds->first(),
        ]);
        $monthYear = $request->month_year;

        if (!$tenantId || !$branchId) {
            return response()->json([
                'message' => 'Unable to resolve valid tenant/branch for payroll generation.',
                'errors' => [
                    'branch_id' => ['Please select a valid branch/company.'],
                ],
            ], 422);
        }

        // Get all active employees for the branch
        $employees = Employee::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->get();

        $generatedPayrolls = [];

        foreach ($employees as $employee) {
            // Check if payroll already exists
            $existingPayroll = Payroll::where('employee_id', $employee->id)
                ->where('month_year', $monthYear)
                ->first();

            if ($existingPayroll) {
                continue; // Skip if already generated
            }

            $calculation = $this->calculatePayrollForEmployee($employee, $monthYear);

            $payroll = Payroll::create($this->filterPayrollPayload([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'employee_id' => $employee->id,
                'month_year' => $monthYear,
                'basic_salary' => $calculation['basic_salary'],
                'earned_basic_salary' => $calculation['earned_basic_salary'],
                'allowances' => $calculation['allowances'],
                'deductions' => $calculation['deductions'],
                'commission_amount' => $calculation['commission_amount'],
                'attendance_deduction_amount' => $calculation['attendance_deduction_amount'],
                'late_hours' => $calculation['late_hours'],
                'late_deduction_amount' => $calculation['late_deduction_amount'],
                'epf_employee_amount' => $calculation['epf_employee_amount'],
                'epf_employer_amount' => $calculation['epf_employer_amount'],
                'etf_employee_amount' => $calculation['etf_employee_amount'],
                'etf_employer_amount' => $calculation['etf_employer_amount'],
                'gross_salary' => $calculation['gross_salary'],
                'apit_tax_amount' => $calculation['apit_tax_amount'],
                'net_salary' => $calculation['net_salary'],
                'working_days' => $calculation['working_days'],
                'present_days' => $calculation['present_days'],
                'absent_days' => $calculation['absent_days'],
                'overtime_hours' => $calculation['overtime_hours'],
                'overtime_amount' => $calculation['overtime_amount'],
                'status' => 'pending',
            ]));

            $generatedPayrolls[] = $this->appendBreakdown($payroll->load(['employee.department', 'employee.designation']));
        }

        return response()->json([
            'message' => 'Payroll generated successfully',
            'payrolls' => $generatedPayrolls,
        ]);
    }

    /**
     * Recalculate payroll for an existing month.
     */
    public function recalculate(Request $request): JsonResponse
    {
        $request->validate([
            'branch_id' => 'nullable|exists:companies,id',
            'month_year' => 'required|date_format:Y-m',
            'force_paid' => 'nullable|boolean',
        ]);

        $user = $request->user();
        $companyIds = Company::pluck('id')->map(fn ($id) => (int) $id)->values();
        $branchId = $this->firstValidCompanyId($companyIds, [
            $request->branch_id,
            $user?->branch_id,
            $user?->employee?->branch_id,
            $companyIds->first(),
        ]);
        $tenantId = $this->firstValidCompanyId($companyIds, [
            $user?->employee?->tenant_id,
            $branchId,
            $companyIds->first(),
        ]);

        if (!$tenantId || !$branchId) {
            return response()->json([
                'message' => 'Unable to resolve valid tenant/branch for payroll recalculation.',
                'errors' => [
                    'branch_id' => ['Please select a valid branch/company.'],
                ],
            ], 422);
        }

        $monthYear = $request->month_year;
        $forcePaid = (bool) $request->boolean('force_paid');

        $employees = Employee::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->get();

        $created = 0;
        $updated = 0;
        $skippedPaid = 0;

        foreach ($employees as $employee) {
            $calculation = $this->calculatePayrollForEmployee($employee, $monthYear);

            $payload = $this->filterPayrollPayload([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'employee_id' => $employee->id,
                'month_year' => $monthYear,
                'basic_salary' => $calculation['basic_salary'],
                'earned_basic_salary' => $calculation['earned_basic_salary'],
                'allowances' => $calculation['allowances'],
                'deductions' => $calculation['deductions'],
                'commission_amount' => $calculation['commission_amount'],
                'attendance_deduction_amount' => $calculation['attendance_deduction_amount'],
                'late_hours' => $calculation['late_hours'],
                'late_deduction_amount' => $calculation['late_deduction_amount'],
                'epf_employee_amount' => $calculation['epf_employee_amount'],
                'epf_employer_amount' => $calculation['epf_employer_amount'],
                'etf_employee_amount' => $calculation['etf_employee_amount'],
                'etf_employer_amount' => $calculation['etf_employer_amount'],
                'gross_salary' => $calculation['gross_salary'],
                'apit_tax_amount' => $calculation['apit_tax_amount'],
                'net_salary' => $calculation['net_salary'],
                'working_days' => $calculation['working_days'],
                'present_days' => $calculation['present_days'],
                'absent_days' => $calculation['absent_days'],
                'overtime_hours' => $calculation['overtime_hours'],
                'overtime_amount' => $calculation['overtime_amount'],
            ]);

            $existing = Payroll::where('employee_id', $employee->id)
                ->where('month_year', $monthYear)
                ->first();

            if (!$existing) {
                Payroll::create(array_merge($payload, $this->filterPayrollPayload(['status' => 'pending'])));
                $created++;
                continue;
            }

            if ($existing->status === 'paid' && !$forcePaid) {
                $skippedPaid++;
                continue;
            }

            $existing->update($payload);
            $updated++;
        }

        return response()->json([
            'message' => 'Payroll recalculation completed successfully.',
            'summary' => [
                'month_year' => $monthYear,
                'branch_id' => $branchId,
                'created' => $created,
                'updated' => $updated,
                'skipped_paid' => $skippedPaid,
            ],
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'month_year' => 'required|date_format:Y-m',
            'basic_salary' => 'required|numeric|min:0',
            'earned_basic_salary' => 'nullable|numeric|min:0',
            'allowances' => 'numeric|min:0',
            'deductions' => 'numeric|min:0',
            'commission_amount' => 'nullable|numeric|min:0',
            'attendance_deduction_amount' => 'nullable|numeric|min:0',
            'late_hours' => 'nullable|numeric|min:0',
            'late_deduction_amount' => 'nullable|numeric|min:0',
            'epf_employee_amount' => 'nullable|numeric|min:0',
            'epf_employer_amount' => 'nullable|numeric|min:0',
            'etf_employee_amount' => 'nullable|numeric|min:0',
            'etf_employer_amount' => 'nullable|numeric|min:0',
            'gross_salary' => 'nullable|numeric|min:0',
            'apit_tax_amount' => 'nullable|numeric|min:0',
            'net_salary' => 'required|numeric|min:0',
            'working_days' => 'required|integer|min:0',
            'present_days' => 'required|integer|min:0',
            'absent_days' => 'required|integer|min:0',
            'overtime_hours' => 'numeric|min:0',
            'overtime_amount' => 'numeric|min:0',
            'status' => 'in:pending,processed,paid',
        ]);

        // Get tenant_id and branch_id from authenticated user context
        $user = $request->user();
        $companyIds = Company::pluck('id')->map(fn ($id) => (int) $id)->values();
        $validated['branch_id'] = $this->firstValidCompanyId($companyIds, [
            $user?->branch_id,
            $user?->employee?->branch_id,
            $companyIds->first(),
        ]);
        $validated['tenant_id'] = $this->firstValidCompanyId($companyIds, [
            $user?->employee?->tenant_id,
            $validated['branch_id'],
            $companyIds->first(),
        ]);

        if (!$validated['tenant_id'] || !$validated['branch_id']) {
            return response()->json([
                'message' => 'Unable to resolve valid tenant/branch for payroll record.',
                'errors' => [
                    'branch_id' => ['Please configure a valid branch/company for this user.'],
                ],
            ], 422);
        }

        $payroll = Payroll::create($this->filterPayrollPayload($validated));

        return response()->json($this->appendBreakdown($payroll->load(['employee.department', 'employee.designation'])), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Payroll $payroll): JsonResponse
    {
        return response()->json($this->appendBreakdown($payroll->load(['employee.department', 'employee.designation'])));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Payroll $payroll): JsonResponse
    {
        $validated = $request->validate([
            'allowances' => 'numeric|min:0',
            'deductions' => 'numeric|min:0',
            'net_salary' => 'numeric|min:0',
            'status' => 'in:pending,processed,paid',
            'processed_at' => 'nullable|date',
        ]);

        $payroll->update($this->filterPayrollPayload($validated));

        return response()->json($this->appendBreakdown($payroll->load(['employee.department', 'employee.designation'])));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Payroll $payroll): JsonResponse
    {
        $payroll->delete();

        return response()->json(['message' => 'Payroll record deleted successfully']);
    }

    /**
     * Generate PDF payslip
     */
    public function payslip(Payroll $payroll): Response
    {
        $payroll = $this->appendBreakdown($payroll->load(['employee.department', 'employee.designation']));
        $employeeName = trim(($payroll->employee->first_name ?? '') . ' ' . ($payroll->employee->last_name ?? ''));
        $code = $payroll->employee->employee_code ?? 'EMP';
        $safeMonth = str_replace('/', '-', (string) $payroll->month_year);
        $fileName = "payslip_{$code}_{$safeMonth}.pdf";

        $b = $payroll->salary_breakdown ?? [];
        $money = fn ($value) => number_format((float) $value, 2, '.', ',');

        $html = "
        <html>
        <head>
            <style>
                body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #111827; }
                h1 { margin: 0 0 4px 0; font-size: 20px; }
                .muted { color: #6b7280; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
                th { background: #f9fafb; }
                .right { text-align: right; }
                .section-title { margin-top: 18px; font-size: 14px; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Payroll Payslip</h1>
            <div class='muted'>Month: {$payroll->month_year}</div>
            <div class='muted'>Employee: {$employeeName} ({$code})</div>

            <div class='section-title'>Attendance Summary</div>
            <table>
                <tr><th>Working Days</th><th>Present Days</th><th>Absent Days</th><th>Overtime Hours</th><th>Late Hours</th></tr>
                <tr>
                    <td>{$payroll->working_days}</td>
                    <td>{$payroll->present_days}</td>
                    <td>{$payroll->absent_days}</td>
                    <td>{$money($b['overtime_hours'] ?? $payroll->overtime_hours)}</td>
                    <td>{$money($b['late_hours'] ?? ($payroll->late_hours ?? 0))}</td>
                </tr>
            </table>

            <div class='section-title'>Salary Breakdown</div>
            <table>
                <tr><th>Component</th><th class='right'>Amount</th></tr>
                <tr><td>Basic Salary</td><td class='right'>{$money($b['basic_salary'] ?? $payroll->basic_salary)}</td></tr>
                <tr><td>Earned Basic (Attendance)</td><td class='right'>{$money($b['earned_basic_salary'] ?? ($payroll->earned_basic_salary ?? $payroll->basic_salary))}</td></tr>
                <tr><td>Commission</td><td class='right'>+{$money($b['commission_amount'] ?? ($payroll->commission_amount ?? 0))}</td></tr>
                <tr><td>Overtime</td><td class='right'>+{$money($b['overtime_amount'] ?? $payroll->overtime_amount)}</td></tr>
                <tr><td>Custom Allowances</td><td class='right'>+{$money($b['custom_allowances_total'] ?? 0)}</td></tr>
                <tr><td>Attendance Deduction</td><td class='right'>-{$money($b['attendance_deduction_amount'] ?? ($payroll->attendance_deduction_amount ?? 0))}</td></tr>
                <tr><td>Late Deduction</td><td class='right'>-{$money($b['late_deduction_amount'] ?? ($payroll->late_deduction_amount ?? 0))}</td></tr>
                <tr><td>EPF (Employee)</td><td class='right'>-{$money($b['epf_employee_amount'] ?? ($payroll->epf_employee_amount ?? 0))}</td></tr>
                <tr><td>ETF (Employee)</td><td class='right'>-{$money($b['etf_employee_amount'] ?? ($payroll->etf_employee_amount ?? 0))}</td></tr>
                <tr><td>APIT Tax</td><td class='right'>-{$money($b['apit_tax_amount'] ?? ($payroll->apit_tax_amount ?? 0))}</td></tr>
                <tr><td>Custom Deductions</td><td class='right'>-{$money($b['custom_deductions_total'] ?? 0)}</td></tr>
                <tr><td><strong>Gross Salary</strong></td><td class='right'><strong>{$money($b['gross_salary'] ?? ($payroll->gross_salary ?? 0))}</strong></td></tr>
                <tr><td><strong>Net Salary</strong></td><td class='right'><strong>{$money($b['net_salary'] ?? $payroll->net_salary)}</strong></td></tr>
            </table>
        </body>
        </html>";

        return Pdf::loadHTML($html)->download($fileName);
    }

    private function calculatePayrollForEmployee($employee, string $monthYear): array
    {
        $monthStart = Carbon::createFromFormat('Y-m', $monthYear)->startOfMonth();
        $monthEnd = (clone $monthStart)->endOfMonth();

        $attendance = Attendance::where('employee_id', $employee->id)
            ->whereBetween('date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->get();

        $workingDays = $this->countWeekdaysInMonth($monthStart, $monthEnd);
        $presentDays = $attendance->whereIn('status', ['present', 'late'])->count();
        $halfDays = $attendance->where('status', 'half_day')->count();
        $presentEquivalent = $presentDays + ($halfDays * 0.5);
        $absentDays = max(0, round($workingDays - $presentEquivalent, 2));

        $effectiveWorkHours = $attendance->sum(function (Attendance $row) {
            if ($row->work_hours !== null) {
                return (float) $row->work_hours;
            }

            return match ($row->status) {
                'present', 'late' => self::STANDARD_DAILY_WORK_HOURS,
                'half_day' => self::STANDARD_DAILY_WORK_HOURS / 2,
                default => 0,
            };
        });

        $scheduledHours = $presentEquivalent * self::STANDARD_DAILY_WORK_HOURS;
        $overtimeHours = max(0, round($effectiveWorkHours - $scheduledHours, 2));

        $lateHours = round($attendance->where('status', 'late')->sum(function (Attendance $row) {
            if ($row->work_hours !== null) {
                return max(0, self::STANDARD_DAILY_WORK_HOURS - (float) $row->work_hours);
            }

            return 1;
        }), 2);

        $basicSalary = round((float) ($employee->basic_salary ?? 0), 2);
        $dailyRate = $workingDays > 0 ? ($basicSalary / $workingDays) : ($basicSalary / 30);
        $earnedBasicSalary = round(min($basicSalary, $dailyRate * $presentEquivalent), 2);
        $attendanceDeductionAmount = round(max(0, $basicSalary - $earnedBasicSalary), 2);

        $commissionPct = (float) ($employee->commission ?? 0);
        $commissionAmount = round($earnedBasicSalary * ($commissionPct / 100), 2);

        $overtimeRate = (float) ($employee->overtime_payment_per_hour ?? 0);
        $overtimeAmount = round($overtimeHours * $overtimeRate, 2);

        $lateDeductionRate = (float) ($employee->deduction_late_hour ?? 0);
        $lateDeductionAmount = round($lateHours * $lateDeductionRate, 2);

        $epfEmployeeAmount = round($earnedBasicSalary * ((float) ($employee->epf_employee_contribution ?? 0) / 100), 2);
        $epfEmployerAmount = round($earnedBasicSalary * ((float) ($employee->epf_employer_contribution ?? 0) / 100), 2);
        $etfEmployeeAmount = round($earnedBasicSalary * ((float) ($employee->etf_employee_contribution ?? 0) / 100), 2);
        $etfEmployerAmount = round($earnedBasicSalary * ((float) ($employee->etf_employer_contribution ?? 0) / 100), 2);

        $taxApplicable = (bool) ($employee->tax_applicable ?? false);
        $apitTaxAmount = 0.0;
        if ($taxApplicable) {
            $apitFixed = (float) ($employee->apit_tax_amount ?? 0);
            $apitRate = (float) ($employee->apit_tax_rate ?? 0);
            $apitTaxAmount = $apitFixed > 0
                ? $apitFixed
                : round(($earnedBasicSalary + $commissionAmount + $overtimeAmount) * ($apitRate / 100), 2);
        }

            $adjustments = $this->calculateEmployeeAdjustments((int) $employee->id, $earnedBasicSalary);
            $customAllowancesTotal = $adjustments['allowances_total'];
            $customDeductionsTotal = $adjustments['deductions_total'];
            $customAllowanceItems = $adjustments['allowance_items'];
            $customDeductionItems = $adjustments['deduction_items'];

            $allowances = round($commissionAmount + $overtimeAmount + $customAllowancesTotal, 2);
            $deductions = round($attendanceDeductionAmount + $lateDeductionAmount + $epfEmployeeAmount + $etfEmployeeAmount + $apitTaxAmount + $customDeductionsTotal, 2);
        $grossSalary = round($earnedBasicSalary + $allowances, 2);
        $netSalary = round(max(0, $grossSalary - $deductions), 2);

        return [
            'basic_salary' => $basicSalary,
            'earned_basic_salary' => $earnedBasicSalary,
            'allowances' => $allowances,
            'deductions' => $deductions,
            'commission_amount' => $commissionAmount,
            'attendance_deduction_amount' => $attendanceDeductionAmount,
            'late_hours' => $lateHours,
            'late_deduction_amount' => $lateDeductionAmount,
            'epf_employee_amount' => $epfEmployeeAmount,
            'epf_employer_amount' => $epfEmployerAmount,
            'etf_employee_amount' => $etfEmployeeAmount,
            'etf_employer_amount' => $etfEmployerAmount,
            'gross_salary' => $grossSalary,
            'apit_tax_amount' => $apitTaxAmount,
            'net_salary' => $netSalary,
            'working_days' => (int) $workingDays,
            'present_days' => (int) floor($presentEquivalent),
            'absent_days' => (int) ceil($absentDays),
            'overtime_hours' => $overtimeHours,
            'overtime_amount' => $overtimeAmount,
            'custom_allowances_total' => $customAllowancesTotal,
            'custom_deductions_total' => $customDeductionsTotal,
            'custom_allowance_items' => $customAllowanceItems,
            'custom_deduction_items' => $customDeductionItems,
        ];
    }

    private function calculateEmployeeAdjustments(int $employeeId, float $earnedBasicSalary): array
    {
        $rows = EmployeeAllowanceDeduction::query()
            ->where('employee_id', $employeeId)
            ->where('is_active', true)
            ->get();

        $allowanceItems = [];
        $deductionItems = [];
        $allowancesTotal = 0.0;
        $deductionsTotal = 0.0;

        foreach ($rows as $row) {
            $rawAmount = (float) ($row->amount ?? 0);
            $isPercentage = ($row->amount_type ?? 'fixed') === 'percentage';
            $calculatedAmount = $isPercentage
                ? round($earnedBasicSalary * ($rawAmount / 100), 2)
                : round($rawAmount, 2);

            $item = [
                'id' => (int) $row->id,
                'name' => (string) ($row->name ?? ''),
                'amount' => $calculatedAmount,
                'amount_type' => (string) ($row->amount_type ?? 'fixed'),
                'raw_amount' => $rawAmount,
            ];

            if (($row->type ?? '') === 'allowance') {
                $allowancesTotal += $calculatedAmount;
                $allowanceItems[] = $item;
            }

            if (($row->type ?? '') === 'deduction') {
                $deductionsTotal += $calculatedAmount;
                $deductionItems[] = $item;
            }
        }

        return [
            'allowances_total' => round($allowancesTotal, 2),
            'deductions_total' => round($deductionsTotal, 2),
            'allowance_items' => $allowanceItems,
            'deduction_items' => $deductionItems,
        ];
    }

    private function countWeekdaysInMonth(Carbon $start, Carbon $end): int
    {
        $count = 0;
        $cursor = $start->copy();

        while ($cursor->lte($end)) {
            if ($cursor->isWeekday()) {
                $count++;
            }
            $cursor->addDay();
        }

        return $count;
    }

    private function appendBreakdown(Payroll $payroll): Payroll
    {
        $earnedBasicSalary = (float) ($payroll->earned_basic_salary ?? $payroll->basic_salary);
        $adjustments = $this->calculateEmployeeAdjustments((int) $payroll->employee_id, $earnedBasicSalary);

        $payroll->setAttribute('salary_breakdown', [
            'basic_salary' => (float) $payroll->basic_salary,
            'earned_basic_salary' => $earnedBasicSalary,
            'commission_amount' => (float) ($payroll->commission_amount ?? 0),
            'overtime_hours' => (float) ($payroll->overtime_hours ?? 0),
            'overtime_amount' => (float) ($payroll->overtime_amount ?? 0),
            'attendance_deduction_amount' => (float) ($payroll->attendance_deduction_amount ?? 0),
            'late_hours' => (float) ($payroll->late_hours ?? 0),
            'late_deduction_amount' => (float) ($payroll->late_deduction_amount ?? 0),
            'epf_employee_amount' => (float) ($payroll->epf_employee_amount ?? 0),
            'epf_employer_amount' => (float) ($payroll->epf_employer_amount ?? 0),
            'etf_employee_amount' => (float) ($payroll->etf_employee_amount ?? 0),
            'etf_employer_amount' => (float) ($payroll->etf_employer_amount ?? 0),
            'apit_tax_amount' => (float) ($payroll->apit_tax_amount ?? 0),
            'allowances' => (float) ($payroll->allowances ?? 0),
            'deductions' => (float) ($payroll->deductions ?? 0),
            'gross_salary' => (float) ($payroll->gross_salary ?? (($payroll->basic_salary ?? 0) + ($payroll->allowances ?? 0))),
            'net_salary' => (float) $payroll->net_salary,
            'custom_allowances_total' => (float) $adjustments['allowances_total'],
            'custom_deductions_total' => (float) $adjustments['deductions_total'],
            'custom_allowance_items' => $adjustments['allowance_items'],
            'custom_deduction_items' => $adjustments['deduction_items'],
        ]);

        return $payroll;
    }

    private function firstValidCompanyId($companyIds, array $candidates): ?int
    {
        $validIds = $companyIds instanceof \Illuminate\Support\Collection
            ? $companyIds
            : collect($companyIds);

        foreach ($candidates as $candidate) {
            $id = (int) ($candidate ?? 0);
            if ($id > 0 && $validIds->contains($id)) {
                return $id;
            }
        }

        return null;
    }

    private function filterPayrollPayload(array $payload): array
    {
        $columns = $this->getPayrollColumns();
        if (empty($columns)) {
            return $payload;
        }

        return array_intersect_key($payload, array_flip($columns));
    }

    private function getPayrollColumns(): array
    {
        if ($this->payrollColumns !== null) {
            return $this->payrollColumns;
        }

        if (!Schema::hasTable('payrolls')) {
            $this->payrollColumns = [];
            return $this->payrollColumns;
        }

        $this->payrollColumns = Schema::getColumnListing('payrolls');
        return $this->payrollColumns;
    }
}
