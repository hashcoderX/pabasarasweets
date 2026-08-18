<?php

namespace App\Http\Controllers;

use App\Models\InventoryCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class InventoryCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = InventoryCategory::query();

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where('name', 'like', "%{$search}%");
        }

        $categories = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $categories,
            'message' => 'Inventory categories retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:100',
            'type' => 'required|in:raw_material,finished_good,office_asset',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $name = preg_replace('/\s+/', ' ', trim((string) $request->input('name')));
        $type = (string) $request->input('type');
        $status = (string) ($request->input('status') ?? 'active');

        $existing = InventoryCategory::where('type', $type)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->first();

        if ($existing) {
            if ($existing->status !== 'active') {
                $existing->update(['status' => 'active']);
            }

            return response()->json([
                'success' => true,
                'data' => $existing,
                'message' => 'Inventory category already exists',
            ]);
        }

        $category = InventoryCategory::create([
            'name' => $name,
            'type' => $type,
            'status' => $status,
        ]);

        return response()->json([
            'success' => true,
            'data' => $category,
            'message' => 'Inventory category created successfully',
        ], 201);
    }
}
