<?php

namespace App\Http\Controllers;

use App\Models\DistributionLiveLocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DistributionLiveLocationController extends Controller
{
    private function isAdmin($user): bool
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

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->isAdmin($user)) {
            return response()->json([
                'success' => false,
                'message' => 'Only admins can view all ref live locations.',
            ], 403);
        }

        $locations = DistributionLiveLocation::with([
            'user:id,name,email,employee_id',
            'employee:id,employee_code,first_name,last_name',
        ])
            ->orderByDesc('captured_at')
            ->orderByDesc('updated_at')
            ->get()
            ->map(function (DistributionLiveLocation $row) {
                $employee = $row->employee;
                $employeeName = trim((string) ($employee?->full_name ?? ''));
                if ($employeeName === '') {
                    $employeeName = trim(((string) ($employee?->first_name ?? '')) . ' ' . ((string) ($employee?->last_name ?? '')));
                }

                return [
                    'id' => $row->id,
                    'user_id' => $row->user_id,
                    'employee_id' => $row->employee_id,
                    'ref_name' => $row->ref_name ?: ($employeeName ?: ($row->user?->name ?? 'Unknown Ref')),
                    'ref_code' => $row->ref_code ?: ($employee?->employee_code ?? null),
                    'latitude' => $row->latitude,
                    'longitude' => $row->longitude,
                    'accuracy' => $row->accuracy,
                    'heading' => $row->heading,
                    'speed' => $row->speed,
                    'captured_at' => optional($row->captured_at)->toISOString(),
                    'updated_at' => optional($row->updated_at)->toISOString(),
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'data' => $locations,
            'message' => 'Live ref locations retrieved successfully',
        ]);
    }

    public function ping(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'accuracy' => 'nullable|numeric|min:0',
            'heading' => 'nullable|numeric|min:0|max:360',
            'speed' => 'nullable|numeric|min:0',
            'captured_at' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated',
            ], 401);
        }

        $employee = $user->employee;
        $employeeName = trim((string) ($employee?->full_name ?? ''));
        if ($employeeName === '') {
            $employeeName = trim(((string) ($employee?->first_name ?? '')) . ' ' . ((string) ($employee?->last_name ?? '')));
        }

        $location = DistributionLiveLocation::updateOrCreate(
            ['user_id' => $user->id],
            [
                'employee_id' => $employee?->id,
                'ref_code' => $employee?->employee_code,
                'ref_name' => $employeeName ?: ($user->name ?? null),
                'latitude' => $payload['latitude'],
                'longitude' => $payload['longitude'],
                'accuracy' => $payload['accuracy'] ?? null,
                'heading' => $payload['heading'] ?? null,
                'speed' => $payload['speed'] ?? null,
                'captured_at' => $payload['captured_at'] ?? now(),
            ]
        );

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $location->id,
                'latitude' => $location->latitude,
                'longitude' => $location->longitude,
                'accuracy' => $location->accuracy,
                'captured_at' => optional($location->captured_at)->toISOString(),
            ],
            'message' => 'Live location updated successfully',
        ]);
    }
}
