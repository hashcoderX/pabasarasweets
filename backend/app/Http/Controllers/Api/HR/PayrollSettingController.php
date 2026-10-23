<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\PayrollSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class PayrollSettingController extends Controller
{
    private function payrollSettingsTableReady(): bool
    {
        return Schema::hasTable('payroll_settings');
    }

    private function defaultSettings(): array
    {
        return [
            'salary_mode' => 'monthly',
            'daily_rate' => null,
            'standard_working_days' => 30,
            'prorate_by_attendance' => true,
            'sunday_payment_enabled' => false,
            'sunday_payment_rate' => null,
            'poya_payment_enabled' => false,
            'poya_payment_rate' => null,
        ];
    }

    private function firstValidCompanyId($validIds, array $candidates): ?int
    {
        foreach ($candidates as $candidate) {
            $id = (int) ($candidate ?? 0);
            if ($id > 0 && $validIds->contains($id)) {
                return $id;
            }
        }

        return null;
    }

    private function resolveTenantBranch(Request $request): array
    {
        $user = $request->user();
        $companyIds = Company::pluck('id')->map(fn ($id) => (int) $id)->values();
        $branchId = $this->firstValidCompanyId($companyIds, [
            $request->input('branch_id'),
            $user?->branch_id,
            $user?->employee?->branch_id,
            $companyIds->first(),
        ]);
        $tenantId = $this->firstValidCompanyId($companyIds, [
            $user?->employee?->tenant_id,
            $branchId,
            $companyIds->first(),
        ]);

        return [$tenantId, $branchId];
    }

    public function show(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->resolveTenantBranch($request);
        if (!$tenantId) {
            return response()->json([
                'message' => 'Unable to resolve tenant for payroll settings.',
            ], 422);
        }

        if (!$this->payrollSettingsTableReady()) {
            return response()->json([
                'branch_id' => $branchId,
                'settings' => $this->defaultSettings(),
                'storage_ready' => false,
            ]);
        }

        $settings = PayrollSetting::query()
            ->where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->first();

        $payload = $this->defaultSettings();
        if ($settings) {
            $payload = array_merge($payload, $settings->only(array_keys($payload)));
        }

        return response()->json([
            'branch_id' => $branchId,
            'settings' => $payload,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => 'nullable|exists:companies,id',
            'salary_mode' => 'required|in:monthly,daily',
            'daily_rate' => 'nullable|numeric|min:0',
            'standard_working_days' => 'required|integer|min:1|max:31',
            'prorate_by_attendance' => 'required|boolean',
            'sunday_payment_enabled' => 'required|boolean',
            'sunday_payment_rate' => 'nullable|numeric|min:0',
            'poya_payment_enabled' => 'required|boolean',
            'poya_payment_rate' => 'nullable|numeric|min:0',
        ]);

        [$tenantId, $branchId] = $this->resolveTenantBranch($request);
        if (!$tenantId || !$branchId) {
            return response()->json([
                'message' => 'Unable to resolve valid tenant/branch for payroll settings.',
            ], 422);
        }

        if (!$this->payrollSettingsTableReady()) {
            return response()->json([
                'message' => 'Payroll settings storage is not ready. Please run database migrations.',
                'storage_ready' => false,
            ], 503);
        }

        if ($data['salary_mode'] === 'daily' && (!isset($data['daily_rate']) || (float) $data['daily_rate'] <= 0)) {
            return response()->json([
                'message' => 'Daily rate must be greater than 0 for daily mode.',
            ], 422);
        }

        if ($data['sunday_payment_enabled'] && (!isset($data['sunday_payment_rate']) || (float) $data['sunday_payment_rate'] <= 0)) {
            return response()->json([
                'message' => 'Sunday payment rate must be greater than 0 when enabled.',
            ], 422);
        }

        if ($data['poya_payment_enabled'] && (!isset($data['poya_payment_rate']) || (float) $data['poya_payment_rate'] <= 0)) {
            return response()->json([
                'message' => 'Poya payment rate must be greater than 0 when enabled.',
            ], 422);
        }

        $setting = PayrollSetting::updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
            ],
            [
                'salary_mode' => $data['salary_mode'],
                'daily_rate' => $data['salary_mode'] === 'daily' ? (float) $data['daily_rate'] : null,
                'standard_working_days' => (int) $data['standard_working_days'],
                'prorate_by_attendance' => (bool) $data['prorate_by_attendance'],
                'sunday_payment_enabled' => (bool) $data['sunday_payment_enabled'],
                'sunday_payment_rate' => $data['sunday_payment_enabled'] ? (float) $data['sunday_payment_rate'] : null,
                'poya_payment_enabled' => (bool) $data['poya_payment_enabled'],
                'poya_payment_rate' => $data['poya_payment_enabled'] ? (float) $data['poya_payment_rate'] : null,
            ]
        );

        return response()->json([
            'message' => 'Payroll settings updated successfully.',
            'branch_id' => $branchId,
            'settings' => array_merge($this->defaultSettings(), $setting->only(array_keys($this->defaultSettings()))),
        ]);
    }
}
