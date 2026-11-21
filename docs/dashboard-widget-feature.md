# Dashboard Widget Feature Guide

## Purpose
This feature controls which dashboard widgets and sidebar links are visible per user.

It supports:
- Hide/show individual widgets.
- Hide sidebar links using close buttons when controls are unlocked.
- Lock/unlock widget controls with Super Admin confirmation.
- Persist visibility state in database table `dashboard_widget_permissions`.

## Main Components

### Backend
- Controller: backend/app/Http/Controllers/DashboardWidgetPermissionController.php
- Model: backend/app/Models/DashboardWidgetPermission.php
- Migration: backend/database/migrations/2026_07_16_120000_create_dashboard_widget_permissions_table.php
- API routes: backend/routes/api.php
  - GET api/dashboard/widgets/me
  - PUT api/dashboard/widgets/me

### Frontend
- Dashboard page logic: frontend/app/dashboard/page.tsx
- Sidebar link rendering and close behavior: frontend/app/dashboard/DashboardShell.tsx

## Database Design
Table: dashboard_widget_permissions

Columns:
- id
- user_id
- widget_key
- is_visible (boolean)
- hidden_at (timestamp nullable)
- created_at, updated_at

Constraint:
- Unique on (user_id, widget_key)

Notes:
- Each user has their own visibility state.
- Hidden widgets are saved with `is_visible = 0` and `hidden_at` set.

## Backend Flow

### GET api/dashboard/widgets/me
Returns:
- widgets map (widget_key => true/false)
- widget_controls_locked (boolean)

### PUT api/dashboard/widgets/me
Input:
- widget_key (required)
- is_visible (required boolean)
- super_admin_email (optional, required only in locked mode for non-super-admin)
- super_admin_password (optional, required only in locked mode for non-super-admin)
- lock_widget_controls (optional boolean)

Validation and behavior:
1. widget_key must exist in WIDGET_KEYS allowlist.
2. If actor is not Super Admin and controls are locked, Super Admin credentials are required.
3. If controls are unlocked, user can update own widget visibility directly.
4. Widget visibility is saved via updateOrCreate into dashboard_widget_permissions.
5. If lock_widget_controls is present, lock flag is also updated using special key `__widget_controls_lock__`.

## Frontend Flow

### Initial load
1. Dashboard loads widget map and lock state from API.
2. Sidebar also hydrates from local storage cache and then API.

### Shared local keys
- dashboard_sidebar_widget_visibility_v1
- dashboard_widget_controls_locked_v1

### Shared event
- dashboard-widget-controls-updated

This event is dispatched when widget visibility or lock state changes, so dashboard and sidebar stay in sync instantly.

### Sidebar close button behavior
- Close buttons appear only when controls are unlocked.
- On click, frontend calls PUT api/dashboard/widgets/me with is_visible=false for that widget key.
- On success, link is removed from sidebar and cache is updated.
- On failure, link remains visible.

### Lock and unlock behavior
- Unlock: enables close buttons and direct hide actions.
- Lock: hides close buttons.
- Hidden widgets should remain hidden after locking.

## Important Implementation Rules

1. Every sidebar widget key must exist in backend WIDGET_KEYS.
   - Example: `branches` must be present, otherwise hide requests fail with invalid widget key.

2. Keep cache updates as patch/merge when possible.
   - Do not overwrite full visibility cache with stale state during lock/confirm flows.

3. Avoid side effects inside React setState updater functions.
   - Dispatch events and localStorage writes outside updater callbacks to prevent cross-component render warnings.

## Troubleshooting

### Problem: One specific link does not hide
Check:
1. Sidebar widgetKey value in DashboardShell.tsx.
2. Matching key exists in backend WIDGET_KEYS allowlist.

### Problem: Hidden links reappear after lock
Check:
1. Confirm visibility cache is merged with patch updates, not overwritten by stale full state.
2. Confirm event dispatch runs after visibility save.

### Problem: Close buttons do not appear after unlock
Check:
1. widget_controls_locked in API response is false.
2. dashboard_widget_controls_locked_v1 is updated.
3. dashboard-widget-controls-updated event is dispatched and handled.

## Extension Checklist
When adding a new dashboard module/widget:
1. Add widget key to backend WIDGET_KEYS.
2. Add frontend widget key usage (page card/sidebar link).
3. Ensure hide/show API calls use the same key.
4. Verify lock/unlock and restore behavior.
5. Verify persistence in dashboard_widget_permissions table.
