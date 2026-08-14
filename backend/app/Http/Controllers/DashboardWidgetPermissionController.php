<?php

namespace App\Http\Controllers;

use App\Models\DashboardWidgetPermission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DashboardWidgetPermissionController extends Controller
{
    private const WIDGET_KEYS = [
        'hrm',
        'reports',
        'production',
        'purchasing',
        'outlets',
        'stock',
        'vehicle-loading',
        'distribution',
        'accounts',
        'company-settings',
        'user-management',
        'system-settings',
        'security-settings',
        'backup-restore',
        'hrm-employees',
        'hrm-departments',
        'hrm-designations',
        'hrm-attendance',
        'hrm-leaves',
        'hrm-roles',
        'hrm-payroll',
        'hrm-quick-add-employee',
        'hrm-quick-view-reports',
        'hrm-quick-mark-attendance',
        'hrm-quick-process-payroll',
    ];

    private function isAdminUser($user): bool
    {
        if (!$user) {
            return false;
        }

        if (!$user->employee_id) {
            return true;
        }

        if ($user->hasRole('Super Admin') || $user->hasRole('Admin')) {
            return true;
        }

        $legacyRole = strtolower((string) ($user->role ?? ''));

        return str_contains($legacyRole, 'admin');
    }

    private function getVisibilityMapForUser(int $userId): array
    {
        $base = [];
        foreach (self::WIDGET_KEYS as $key) {
            $base[$key] = true;
        }

        $rows = DashboardWidgetPermission::query()
            ->where('user_id', $userId)
            ->whereIn('widget_key', self::WIDGET_KEYS)
            ->get(['widget_key', 'is_visible']);

        foreach ($rows as $row) {
            $base[$row->widget_key] = (bool) $row->is_visible;
        }

        return $base;
    }

    private function setWidgetVisibilityForUser(int $userId, string $widgetKey, bool $isVisible): void
    {
        if (!in_array($widgetKey, self::WIDGET_KEYS, true)) {
            return;
        }

        DashboardWidgetPermission::updateOrCreate(
            [
                'user_id' => $userId,
                'widget_key' => $widgetKey,
            ],
            [
                'is_visible' => $isVisible,
                'hidden_at' => $isVisible ? null : now(),
            ]
        );
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated',
            ], 401);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'user_id' => $user->id,
                'is_admin' => $this->isAdminUser($user),
                'widgets' => $this->getVisibilityMapForUser((int) $user->id),
            ],
            'message' => 'Widget visibility loaded successfully',
        ]);
    }

    public function updateMe(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated',
            ], 401);
        }

        $validator = Validator::make($request->all(), [
            'widget_key' => 'required|string',
            'is_visible' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $widgetKey = (string) $payload['widget_key'];

        if (!in_array($widgetKey, self::WIDGET_KEYS, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid widget key',
            ], 422);
        }

        $this->setWidgetVisibilityForUser((int) $user->id, $widgetKey, (bool) $payload['is_visible']);

        return response()->json([
            'success' => true,
            'data' => [
                'user_id' => $user->id,
                'widgets' => $this->getVisibilityMapForUser((int) $user->id),
            ],
            'message' => 'Widget visibility updated successfully',
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $actor = $request->user();

        if (!$this->isAdminUser($actor)) {
            return response()->json([
                'success' => false,
                'message' => 'Only admins can manage widget permissions.',
            ], 403);
        }

        $users = User::query()
            ->with(['employee:id,employee_code,first_name,last_name'])
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'employee_id'])
            ->map(function (User $user) {
                $employee = $user->employee;
                $employeeName = trim(((string) ($employee?->first_name ?? '')) . ' ' . ((string) ($employee?->last_name ?? '')));

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'employee_id' => $user->employee_id,
                    'employee_code' => $employee?->employee_code,
                    'employee_name' => $employeeName ?: null,
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'data' => $users,
            'message' => 'Users loaded successfully',
        ]);
    }

    public function show(Request $request, int $userId): JsonResponse
    {
        $actor = $request->user();

        if (!$this->isAdminUser($actor)) {
            return response()->json([
                'success' => false,
                'message' => 'Only admins can manage widget permissions.',
            ], 403);
        }

        $targetUser = User::query()->find($userId);
        if (!$targetUser) {
            return response()->json([
                'success' => false,
                'message' => 'User not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'user_id' => $targetUser->id,
                'widgets' => $this->getVisibilityMapForUser((int) $targetUser->id),
                'available_widget_keys' => self::WIDGET_KEYS,
            ],
            'message' => 'User widget permissions loaded successfully',
        ]);
    }

    public function update(Request $request, int $userId): JsonResponse
    {
        $actor = $request->user();

        if (!$this->isAdminUser($actor)) {
            return response()->json([
                'success' => false,
                'message' => 'Only admins can manage widget permissions.',
            ], 403);
        }

        $targetUser = User::query()->find($userId);
        if (!$targetUser) {
            return response()->json([
                'success' => false,
                'message' => 'User not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'widgets' => 'required|array|min:1',
            'widgets.*' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $widgets = $validator->validated()['widgets'];

        foreach ($widgets as $key => $isVisible) {
            if (!in_array($key, self::WIDGET_KEYS, true)) {
                continue;
            }

            $this->setWidgetVisibilityForUser((int) $targetUser->id, $key, (bool) $isVisible);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'user_id' => $targetUser->id,
                'widgets' => $this->getVisibilityMapForUser((int) $targetUser->id),
            ],
            'message' => 'Widget permissions updated successfully',
        ]);
    }
}
