<?php

namespace App\Http\Controllers;

use App\Models\SalesTarget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class SalesTargetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SalesTarget::with([
            'employee:id,employee_code,first_name,last_name',
            'branch:id,name',
            'product:id,code,name',
            'territory:id,name,origin,destination',
            'products.product:id,code,name',
            'territories.territory:id,name,origin,destination',
        ])->orderByDesc('period_start')->orderByDesc('id');

        foreach (['target_type', 'period_key', 'employee_id', 'branch_id', 'inventory_item_id', 'route_id'] as $filter) {
            if ($request->filled($filter)) $query->where($filter, $request->input($filter));
        }

        return response()->json(['success' => true, 'data' => $query->paginate($request->integer('per_page', 50))]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), $this->rules());
        if ($validator->fails()) return response()->json(['message' => 'Validation failed', 'errors' => $validator->errors()], 422);

        $data = $validator->validated();
        $productIds = $data['product_ids'] ?? [];
        $territoryIds = $data['territory_ids'] ?? [];
        unset($data['product_ids'], $data['territory_ids']);
        $target = DB::transaction(function () use ($data, $productIds, $territoryIds) {
            $target = SalesTarget::create($data);
            $target->products()->createMany(array_map(fn ($id) => ['inventory_item_id' => $id], $productIds));
            $target->territories()->createMany(array_map(fn ($id) => ['route_id' => $id], $territoryIds));
            return $target;
        });
        return response()->json(['success' => true, 'data' => $target->load(['employee', 'branch', 'product', 'territory', 'products.product', 'territories.territory'])], 201);
    }

    public function show(SalesTarget $salesTarget): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $salesTarget->load(['employee', 'branch', 'product', 'territory'])]);
    }

    public function update(Request $request, SalesTarget $salesTarget): JsonResponse
    {
        $validator = Validator::make($request->all(), $this->rules(true));
        if ($validator->fails()) return response()->json(['message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        $data = $validator->validated();
        $productIds = $data['product_ids'] ?? null;
        $territoryIds = $data['territory_ids'] ?? null;
        unset($data['product_ids'], $data['territory_ids']);
        DB::transaction(function () use ($salesTarget, $data, $productIds, $territoryIds) {
            $salesTarget->update($data);
            if ($productIds !== null) {
                $salesTarget->products()->delete();
                $salesTarget->products()->createMany(array_map(fn ($id) => ['inventory_item_id' => $id], $productIds));
            }
            if ($territoryIds !== null) {
                $salesTarget->territories()->delete();
                $salesTarget->territories()->createMany(array_map(fn ($id) => ['route_id' => $id], $territoryIds));
            }
        });
        return response()->json(['success' => true, 'data' => $salesTarget->fresh()->load(['employee', 'branch', 'product', 'territory', 'products.product', 'territories.territory'])]);
    }

    public function destroy(SalesTarget $salesTarget): JsonResponse
    {
        $salesTarget->delete();
        return response()->json(['success' => true, 'message' => 'Sales target deleted successfully.']);
    }

    private function rules(bool $update = false): array
    {
        return [
            'target_type' => ($update ? 'sometimes|' : '') . 'in:employee,branch,product,territory',
            'employee_id' => 'nullable|exists:employees,id',
            'branch_id' => 'nullable|exists:companies,id',
            'inventory_item_id' => 'nullable|exists:inventory_items,id',
            'route_id' => 'nullable|exists:routes,id',
            'product_ids' => 'nullable|array',
            'product_ids.*' => 'exists:inventory_items,id',
            'territory_ids' => 'nullable|array',
            'territory_ids.*' => 'exists:routes,id',
            'all_products' => 'nullable|boolean',
            'period_key' => ($update ? 'sometimes|' : 'required|') . 'string|max:30',
            'period_start' => ($update ? 'sometimes|' : 'required|') . 'date',
            'period_end' => ($update ? 'sometimes|' : 'required|') . 'date|after_or_equal:period_start',
            'target_amount' => 'nullable|numeric|min:0',
            'target_quantity' => 'nullable|numeric|min:0',
            'achieved_amount' => 'nullable|numeric|min:0',
            'achieved_quantity' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ];
    }
}
