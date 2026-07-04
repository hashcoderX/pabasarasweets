<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $roles = Role::with('permissions')->get();
        return response()->json($roles);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:roles',
            'description' => 'nullable|string|max:500',
            'is_active' => 'sometimes|boolean',
            'permissions' => 'array',
            'permissions.*' => 'exists:permissions,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $role = Role::create([
            'name' => $request->name,
            'description' => $request->description,
            'is_active' => $request->has('is_active') ? (bool)$request->is_active : true,
        ]);

        if ($request->has('permissions')) {
            $role->permissions()->attach($request->permissions);
        }

        return response()->json($role->load('permissions'), 201);
    }

    public function show(Role $role): JsonResponse
    {
        return response()->json($role->load('permissions'));
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:roles,name,' . $role->id,
            'description' => 'nullable|string|max:500',
            'is_active' => 'sometimes|boolean',
            'permissions' => 'array',
            'permissions.*' => 'exists:permissions,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $role->update([
            'name' => $request->name,
            'description' => $request->description,
            'is_active' => $request->has('is_active') ? (bool)$request->is_active : $role->is_active,
        ]);

        if ($request->has('permissions')) {
            $role->permissions()->sync($request->permissions);
        }

        return response()->json($role->load('permissions'));
    }

    public function updatePermissions(Request $request, Role $role): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'permissions' => 'required|array',
            'permissions.*' => 'exists:permissions,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $role->permissions()->sync($request->permissions);

        return response()->json([
            'message' => 'Permissions updated successfully',
            'role' => $role->load('permissions')
        ]);
    }

    public function destroy(Role $role): JsonResponse
    {
        DB::transaction(function () use ($role) {
            $role->permissions()->detach();
            $role->users()->detach();
            $role->delete();
        });

        return response()->json(['message' => 'Role deleted successfully']);
    }

    public function assignToUser(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'role_id' => 'required|exists:roles,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = \App\Models\User::find($request->user_id);

        if ($user->roles()->where('roles.id', $request->role_id)->exists()) {
            return response()->json(['message' => 'Role is already assigned to this user']);
        }

        $assignedBy = $request->user()?->id ?? $request->user_id;

        $user->roles()->attach($request->role_id, [
            'assigned_at' => now(),
            'assigned_by' => $assignedBy,
        ]);

        return response()->json(['message' => 'Role assigned to user successfully']);
    }

    public function removeFromUser(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'role_id' => 'required|exists:roles,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = \App\Models\User::find($request->user_id);
        $user->roles()->detach($request->role_id);

        return response()->json(['message' => 'Role removed from user successfully']);
    }

    public function getUserRoles($userId): JsonResponse
    {
        $user = \App\Models\User::with('roles.permissions')->findOrFail($userId);
        return response()->json($user->roles);
    }
}