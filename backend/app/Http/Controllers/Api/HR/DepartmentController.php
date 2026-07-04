<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');

        $query = Department::query();

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $departments = $query->paginate(15);

        return response()->json($departments);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'tenant_id' => 'nullable|integer|exists:companies,id',
            'branch_id' => 'nullable|integer|exists:companies,id',
        ]);

        $defaultCompany = Company::query()->orderBy('id')->first();
        if (!$defaultCompany) {
            return response()->json([
                'message' => 'Cannot create department: no company exists. Please create a company first.',
            ], 422);
        }

        $tenantId = (int)($validated['tenant_id'] ?? $defaultCompany->id);
        $branchId = (int)($validated['branch_id'] ?? $tenantId);

        $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('departments', 'name')->where(fn ($query) => $query->where('tenant_id', $tenantId)),
            ],
        ]);

        // Set default values for required fields
        $departmentData = [
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ];

        $department = Department::create($departmentData);

        return response()->json($department, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Department $department): JsonResponse
    {
        return response()->json($department);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Department $department): JsonResponse
    {
        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('departments', 'name')
                    ->where(fn ($query) => $query->where('tenant_id', $department->tenant_id))
                    ->ignore($department->id),
            ],
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $department->update($validated);

        return response()->json($department);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Department $department): JsonResponse
    {
        $activeEmployeeCount = Employee::query()
            ->where('department_id', $department->id)
            ->count();

        if ($activeEmployeeCount > 0) {
            return response()->json([
                'message' => "Cannot delete this department because {$activeEmployeeCount} active employee(s) are still assigned to it. Reassign them first.",
            ], 422);
        }

        $archivedEmployeeCount = Employee::onlyTrashed()
            ->where('department_id', $department->id)
            ->count();

        $fallbackDepartment = null;
        if ($archivedEmployeeCount > 0) {
            $fallbackDepartment = Department::query()
                ->where('tenant_id', $department->tenant_id)
                ->where('id', '!=', $department->id)
                ->orderBy('id')
                ->first();
        }

        try {
            DB::transaction(function () use ($department, $fallbackDepartment, $archivedEmployeeCount) {
                if ($archivedEmployeeCount > 0) {
                    Employee::onlyTrashed()
                        ->where('department_id', $department->id)
                        ->update([
                            'department_id' => $fallbackDepartment?->id,
                        ]);
                }

                $department->delete();
            });
        } catch (QueryException $exception) {
            return response()->json([
                'message' => 'Cannot delete this department because related records still exist.',
            ], 422);
        }

        return response()->json(['message' => 'Department deleted successfully']);
    }
}
