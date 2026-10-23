<?php

namespace App\Http\Controllers;

use App\Models\DashboardWidgetPermission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class DashboardWidgetPermissionController extends Controller
{
    private const WIDGET_CONTROLS_LOCK_KEY = '__widget_controls_lock__';

    private const WIDGET_KEYS = [
        'hrm',
        'reports',
        'production',
        'production-nav-bar',
        'production-hero-card',
        'production-stats-grid',
        'production-areas-grid',
        'production-area-bom-card',
        'production-area-planning-card',
        'production-area-execution-card',
        'production-area-qc-card',
        'production-area-packaging-card',
        'production-bom-nav-bar',
        'production-bom-workflow-card',
        'production-bom-summary-cards',
        'production-bom-step-panels',
        'production-bom-delete-modal',
        'production-execution-nav-bar',
        'production-execution-flow-card',
        'production-execution-summary-cards',
        'production-execution-step-panels',
        'production-packaging-nav-bar',
        'production-packaging-summary-cards',
        'production-packaging-content-panels',
        'production-packaging-transfer-modal',
        'production-planning-nav-bar',
        'production-planning-flow-card',
        'production-planning-summary-cards',
        'production-planning-content-panels',
        'production-planning-order-confirm-modal',
        'production-qc-nav-bar',
        'production-qc-summary-cards',
        'production-qc-content-panels',
        'purchasing',
        'purchasing-hero-card',
        'purchasing-sections-grid',
        'purchasing-overview-card',
        'purchasing-po-hero-card',
        'purchasing-po-registry-card',
        'purchasing-po-form-modal-pane',
        'purchasing-po-raw-material-modal-pane',
        'purchasing-po-details-modal-pane',
        'purchasing-po-print-modal-pane',
        'purchasing-grn-hero-card',
        'purchasing-grn-tab-navigation',
        'purchasing-grn-po-view-card',
        'purchasing-grn-records-view-card',
        'purchasing-grn-form-modal-pane',
        'purchasing-grn-po-edit-modal-pane',
        'outlets',
        'stock',
        'vehicle-loading',
        'distribution',
        'accounts',
        'accounts-nav-bar',
        'accounts-hero-card',
        'accounts-modules-grid',
        'accounts-balance-board',
        'accounts-module-grn-card',
        'accounts-module-main-card',
        'accounts-module-cheque-card',
        'accounts-module-petty-card',
        'accounts-module-delivery-card',
        'sales-target-preview',
        'sales-target-actions',
        'sales-target-amount-card',
        'sales-target-quantity-card',
        'sales-target-vs-achieved-card',
        'settings-configuration',
        'settings-configuration-note',
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
        'hrm-hero-active-employees',
        'hrm-hero-attendance-rate',
        'hrm-hero-departments',
        'hrm-modules-section',
        'hrm-quick-actions-section',
        'hrm-attendance-header',
        'hrm-attendance-nav-back-button',
        'hrm-attendance-heading-title',
        'hrm-attendance-heading-subtitle',
        'hrm-attendance-tabs',
        'hrm-attendance-tab-button-mark',
        'hrm-attendance-tab-button-upload',
        'hrm-attendance-tab-button-history',
        'hrm-attendance-mark-pane',
        'hrm-attendance-mark-controls',
        'hrm-attendance-mark-table',
        'hrm-attendance-mark-action-buttons',
        'hrm-attendance-upload-pane',
        'hrm-attendance-upload-panel',
        'hrm-attendance-upload-heading',
        'hrm-attendance-upload-action-buttons',
        'hrm-attendance-history-pane',
        'hrm-attendance-history-panel',
        'hrm-attendance-history-heading',
        'hrm-attendance-history-action-buttons',
        'hrm-departments-nav-back-button',
        'hrm-departments-nav-logout-button',
        'hrm-departments-hero-card',
        'hrm-departments-hero-title',
        'hrm-departments-hero-subtitle',
        'hrm-departments-hero-stats',
        'hrm-departments-hero-add-button',
        'hrm-departments-list-card',
        'hrm-departments-list-heading',
        'hrm-departments-list-filter-controls',
        'hrm-departments-list-table-headings',
        'hrm-departments-row-action-buttons',
        'hrm-departments-pagination-controls',
        'hrm-departments-form-pane',
        'hrm-departments-form-heading',
        'hrm-departments-form-action-buttons',
        'hrm-departments-delete-modal-pane',
        'hrm-departments-delete-modal-heading',
        'hrm-departments-delete-modal-action-buttons',
        'hrm-departments-message-modal-pane',
        'hrm-departments-message-modal-heading',
        'hrm-designations-nav-back-button',
        'hrm-designations-nav-logout-button',
        'hrm-designations-hero-card',
        'hrm-designations-hero-title',
        'hrm-designations-hero-subtitle',
        'hrm-designations-hero-stats',
        'hrm-designations-list-card',
        'hrm-designations-list-heading',
        'hrm-designations-list-table-headings',
        'hrm-designations-form-pane',
        'hrm-designations-form-heading',
        'hrm-designations-form-action-buttons',
        'hrm-designations-delete-modal-pane',
        'hrm-designations-delete-modal-heading',
        'hrm-designations-delete-modal-action-buttons',
        'hrm-designations-message-modal-pane',
        'hrm-designations-message-modal-heading',
        'hrm-employees-nav-back-button',
        'hrm-employees-nav-logout-button',
        'hrm-employees-hero-card',
        'hrm-employees-hero-title',
        'hrm-employees-hero-subtitle',
        'hrm-employees-hero-stats',
        'hrm-employees-hero-add-button',
        'hrm-employees-list-card',
        'hrm-employees-list-heading',
        'hrm-employees-list-filter-controls',
        'hrm-employees-list-table-headings',
        'hrm-employees-row-action-buttons',
        'hrm-employees-pagination-controls',
        'hrm-employees-form-pane',
        'hrm-employees-form-heading',
        'hrm-employees-form-action-buttons',
        'hrm-employees-profile-pane',
        'hrm-employees-profile-heading',
        'hrm-employees-documents-pane',
        'hrm-employees-documents-heading',
        'hrm-employees-education-pane',
        'hrm-employees-education-heading',
        'hrm-employees-experience-pane',
        'hrm-employees-experience-heading',
        'hrm-employees-allowances-pane',
        'hrm-employees-allowances-heading',
        'hrm-employees-leave-pane',
        'hrm-employees-leave-heading',
        'hrm-employees-leave-action-buttons',
        'hrm-employees-confirm-pane',
        'hrm-employees-confirm-heading',
        'hrm-employees-confirm-action-buttons',
        'hrm-employees-reset-password-pane',
        'hrm-employees-reset-password-heading',
        'hrm-employees-reset-password-action-buttons',
        'hrm-employees-notice-pane',
        'hrm-employees-notice-heading',
        'hrm-leaves-nav-back-button',
        'hrm-leaves-nav-logout-button',
        'hrm-leaves-hero-card',
        'hrm-leaves-hero-title',
        'hrm-leaves-hero-subtitle',
        'hrm-leaves-hero-stats',
        'hrm-leaves-action-buttons',
        'hrm-leaves-list-card',
        'hrm-leaves-list-heading',
        'hrm-leaves-list-table-headings',
        'hrm-leaves-row-action-buttons',
        'hrm-leaves-form-pane',
        'hrm-leaves-form-heading',
        'hrm-leaves-form-action-buttons',
        'hrm-leaves-types-pane',
        'hrm-leaves-types-heading',
        'hrm-leaves-types-action-buttons',
        'hrm-leaves-approval-pane',
        'hrm-leaves-approval-heading',
        'hrm-leaves-approval-action-buttons',
        'hrm-leaves-notice-pane',
        'hrm-leaves-notice-heading',
        'hrm-leaves-confirm-pane',
        'hrm-leaves-confirm-heading',
        'hrm-leaves-confirm-action-buttons',
        'distribution-nav-back-button',
        'distribution-offline-status-card',
        'distribution-hero-card',
        'distribution-modules-grid',
        'distribution-load-availability-section',
        'distribution-customer-performance-section',
        'distribution-customer-performance-cards',
        'distribution-load-details-modal-pane',
        'distribution-load-details-modal-heading',
        'distribution-load-details-modal-action-buttons',
        'distribution-load-details-cards',
        'distribution-route-customers-section',
        'distribution-route-customers-action-link',
        'distribution-route-customers-cards',
        'distribution-module-load-availability-card',
        'distribution-module-customers-card',
        'distribution-module-invoices-card',
        'distribution-module-returns-card',
        'distribution-module-payments-card',
        'distribution-module-outstanding-payment-card',
        'distribution-module-live-locations-card',
        'distribution-module-reports-card',
        'distribution-customers-nav-back-button',
        'distribution-customers-hero-card',
        'distribution-customers-hero-action-buttons',
        'distribution-customers-filters-card',
        'distribution-customers-table-card',
        'distribution-customers-table-headings',
        'distribution-customers-row-action-buttons',
        'distribution-customers-pagination-controls',
        'distribution-customers-form-modal-pane',
        'distribution-customers-form-modal-heading',
        'distribution-customers-form-modal-action-buttons',
        'distribution-invoices-nav-back-button',
        'distribution-invoices-hero-card',
        'distribution-invoices-hero-action-buttons',
        'distribution-invoices-filters-card',
        'distribution-invoices-delivery-orders-card',
        'distribution-invoices-records-card',
        'distribution-invoices-records-table-headings',
        'distribution-invoices-row-action-buttons',
        'distribution-invoices-create-modal-pane',
        'distribution-invoices-create-modal-heading',
        'distribution-invoices-create-modal-action-buttons',
        'distribution-invoices-delete-modal-pane',
        'distribution-invoices-delete-modal-heading',
        'distribution-invoices-delete-modal-action-buttons',
        'distribution-live-locations-nav-back-button',
        'distribution-live-locations-hero-card',
        'distribution-live-locations-tracking-card',
        'distribution-live-locations-map-card',
        'distribution-live-locations-table-card',
        'distribution-live-locations-table-headings',
        'distribution-payments-nav-back-button',
        'distribution-payments-nav-action-buttons',
        'distribution-payments-offline-status-card',
        'distribution-payments-route-filter-card',
        'distribution-payments-ledger-filter-card',
        'distribution-payments-debtors-card',
        'distribution-payments-records-card',
        'distribution-payments-records-table-headings',
        'distribution-payments-row-action-buttons',
        'distribution-payments-modal-pane',
        'distribution-payments-modal-heading',
        'distribution-payments-modal-action-buttons',
        'distribution-returns-nav-back-button',
        'distribution-returns-offline-status-card',
        'distribution-returns-actions-card',
        'distribution-returns-records-card',
        'distribution-returns-records-table-headings',
        'distribution-returns-records-row-actions',
        'distribution-returns-create-modal-pane',
        'distribution-returns-create-modal-heading',
        'distribution-returns-create-modal-action-buttons',
        'stock-dashboard-hero-card',
        'stock-dashboard-hero-action-button',
        'stock-dashboard-stats-section',
        'stock-dashboard-stat-total-items',
        'stock-dashboard-stat-low-stock-items',
        'stock-dashboard-stat-total-suppliers',
        'stock-dashboard-stat-out-of-stock-items',
        'stock-dashboard-quick-actions-card',
        'stock-dashboard-quick-action-inventory',
        'stock-dashboard-quick-action-suppliers',
        'stock-dashboard-quick-action-levels',
        'stock-dashboard-quick-action-reports',
        'stock-dashboard-quick-action-transfers',
        'stock-dashboard-recent-activity-card',
        'stock-inventory-hero-card',
        'stock-inventory-add-button',
        'stock-inventory-tabs-card',
        'stock-inventory-tab-raw-button',
        'stock-inventory-tab-finished-button',
        'stock-inventory-filter-reset-button',
        'stock-inventory-empty-add-button',
        'stock-inventory-pagination-previous-button',
        'stock-inventory-pagination-next-button',
        'stock-inventory-row-edit-button',
        'stock-inventory-row-delete-button',
        'stock-inventory-table-headings',
        'stock-inventory-column-item',
        'stock-inventory-column-stock',
        'stock-inventory-column-batch',
        'stock-inventory-column-price',
        'stock-inventory-column-status',
        'stock-inventory-column-actions',
        'stock-inventory-item-details-modal-pane',
        'stock-inventory-form-modal-pane',
        'stock-levels-hero-card',
        'stock-levels-refresh-button',
        'stock-levels-table-card',
        'stock-levels-table-headings',
        'stock-reports-hero-card',
        'stock-reports-action-buttons',
        'stock-reports-filters-card',
        'stock-reports-table-card',
        'stock-reports-table-headings',
        'stock-suppliers-hero-card',
        'stock-suppliers-add-button',
        'stock-suppliers-table-card',
        'stock-suppliers-table-headings',
        'stock-suppliers-row-action-buttons',
        'stock-suppliers-modal-pane',
        'stock-transfers-main-content',
        'stock-transfers-back-button',
        'stock-transfers-form-card',
        'stock-transfers-history-card',
        'stock-transfers-table-headings',
        'stock-transfers-details-modal-pane',
        'vehicle-loading-hero-card',
        'vehicle-loading-stats-grid',
        'vehicle-loading-stat-active-loads',
        'vehicle-loading-stat-total-vehicles',
        'vehicle-loading-stat-total-drivers',
        'vehicle-loading-stat-active-routes',
        'vehicle-loading-stat-pending-loads',
        'vehicle-loading-stat-completed-loads',
        'vehicle-loading-stat-total-capacity',
        'vehicle-loading-stat-efficiency-rate',
        'vehicle-loading-quick-actions-card',
        'vehicle-loading-quick-action-create-load',
        'vehicle-loading-quick-action-add-vehicle',
        'vehicle-loading-quick-action-add-driver',
        'vehicle-loading-quick-action-plan-route',
        'vehicle-loading-recent-activity-card',
        'vehicle-loading-recent-activity-row-button',
        'vehicle-loading-load-items-modal-pane',
        'vehicle-loading-load-items-modal-close-button',
        'vehicle-loading-load-items-modal-table-headings',
        'vehicle-loading-drivers-hero-card',
        'vehicle-loading-drivers-message-banner',
        'vehicle-loading-drivers-filters-card',
        'vehicle-loading-drivers-table-card',
        'vehicle-loading-drivers-summary-cards',
        'vehicle-loading-routes-hero-card',
        'vehicle-loading-routes-message-banner',
        'vehicle-loading-routes-filters-card',
        'vehicle-loading-routes-table-card',
        'vehicle-loading-routes-form-modal-pane',
        'vehicle-loading-vehicles-hero-card',
        'vehicle-loading-vehicles-filters-card',
        'vehicle-loading-vehicles-table-card',
        'vehicle-loading-vehicles-summary-cards',
        'vehicle-loading-vehicles-form-modal-pane',
        'vehicle-loading-loads-hero-card',
        'vehicle-loading-loads-filters-card',
        'vehicle-loading-loads-table-card',
        'vehicle-loading-loads-table-headings',
        'vehicle-loading-loads-row-action-buttons',
        'vehicle-loading-loads-summary-cards',
        'vehicle-loading-loads-form-modal-pane',
        'vehicle-loading-loads-details-modal-pane',
        'vehicle-loading-load-items-hero-card',
        'vehicle-loading-load-items-load-selection-card',
        'vehicle-loading-load-items-workspace-card',
        'vehicle-loading-load-items-csv-modal-pane',
        'hrm-sales-targets-hero-card',
        'hrm-sales-targets-nav-back-button',
        'hrm-sales-targets-tabs',
        'hrm-sales-targets-setup-pane',
        'hrm-sales-targets-setup-action-button',
        'hrm-sales-targets-list-pane',
        'hrm-sales-targets-list-table-headings',
        'hrm-sales-targets-list-row-actions',
        'hrm-sales-targets-alert-modal-pane',
        'hrm-sales-targets-alert-modal-heading',
        'hrm-sales-targets-confirm-modal-pane',
        'hrm-sales-targets-confirm-modal-heading',
        'hrm-sales-targets-confirm-modal-action-buttons',
        'hrm-candidates-nav-back-button',
        'hrm-candidates-nav-logout-button',
        'hrm-candidates-hero-card',
        'hrm-candidates-heading-title',
        'hrm-candidates-heading-subtitle',
        'hrm-candidates-heading-actions',
        'hrm-candidates-table-card',
        'hrm-candidates-table-headings',
        'hrm-candidates-row-action-buttons',
        'hrm-candidates-form-pane',
        'hrm-candidates-form-heading',
        'hrm-candidates-form-action-buttons',
        'hrm-candidates-convert-pane',
        'hrm-candidates-convert-heading',
        'hrm-candidates-convert-action-buttons',
        'hrm-candidates-profile-pane',
        'hrm-candidates-profile-heading',
        'hrm-candidates-interview-pane',
        'hrm-candidates-interview-heading',
        'hrm-candidates-interview-action-buttons',
        'hrm-candidates-documents-pane',
        'hrm-candidates-documents-heading',
        'hrm-candidates-education-pane',
        'hrm-candidates-education-heading',
        'hrm-candidates-experience-pane',
        'hrm-candidates-experience-heading',
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

    private function isSuperAdminUser($user): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->hasRole('Super Admin')) {
            return true;
        }

        $legacyRole = strtolower((string) ($user->role ?? ''));
        return str_contains($legacyRole, 'super admin') || str_contains($legacyRole, 'superadmin');
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

    private function getWidgetControlsLockedForUser(int $userId): bool
    {
        $row = DashboardWidgetPermission::query()
            ->where('user_id', $userId)
            ->where('widget_key', self::WIDGET_CONTROLS_LOCK_KEY)
            ->first(['is_visible']);

        return (bool) ($row?->is_visible ?? false);
    }

    private function setWidgetControlsLockedForUser(int $userId, bool $locked): void
    {
        DashboardWidgetPermission::updateOrCreate(
            [
                'user_id' => $userId,
                'widget_key' => self::WIDGET_CONTROLS_LOCK_KEY,
            ],
            [
                'is_visible' => $locked,
                'hidden_at' => $locked ? now() : null,
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
                'widget_controls_locked' => $this->getWidgetControlsLockedForUser((int) $user->id),
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
            'super_admin_email' => 'nullable|email',
            'super_admin_password' => 'nullable|string|min:1',
            'lock_widget_controls' => 'nullable|boolean',
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

        $actorIsSuperAdmin = $this->isSuperAdminUser($user);
        if (!$actorIsSuperAdmin) {
            $email = (string) ($payload['super_admin_email'] ?? '');
            $password = (string) ($payload['super_admin_password'] ?? '');
            if ($email === '' || $password === '') {
                return response()->json([
                    'success' => false,
                    'message' => 'Super Admin confirmation is required.',
                ], 422);
            }

            $superAdmin = User::query()->where('email', $email)->first();
            $passwordOk = $superAdmin && Hash::check($password, (string) $superAdmin->password);
            if (!$superAdmin || !$passwordOk || !$this->isSuperAdminUser($superAdmin)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Super Admin confirmation failed.',
                ], 403);
            }
        }

        $userId = (int) $user->id;
        $this->setWidgetVisibilityForUser($userId, $widgetKey, (bool) $payload['is_visible']);
        if (array_key_exists('lock_widget_controls', $payload)) {
            $this->setWidgetControlsLockedForUser($userId, (bool) $payload['lock_widget_controls']);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'user_id' => $user->id,
                'widgets' => $this->getVisibilityMapForUser($userId),
                'widget_controls_locked' => $this->getWidgetControlsLockedForUser($userId),
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
