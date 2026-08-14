<?php

namespace App\Http\Controllers\Production;

use App\Http\Controllers\Controller;
use App\Models\PackagingBatch;
use App\Models\QcInspection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class QualityControlController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = QcInspection::with([
            'productionOrder:id,product_id,batch_no,production_quantity,produced_quantity,wastage_quantity,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
        ]);

        if ($request->filled('from_date')) {
            $query->whereDate('inspection_date', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('inspection_date', '<=', $request->to_date);
        }

        if ($request->filled('quality_status')) {
            $query->where('quality_status', $request->quality_status);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('inspector_name', 'like', "%{$search}%")
                    ->orWhereHas('productionOrder.product', function ($p) use ($search) {
                        $p->where('name', 'like', "%{$search}%")
                            ->orWhere('code', 'like', "%{$search}%");
                    })
                    ->orWhereHas('productionOrder.plan', function ($plan) use ($search) {
                        $plan->where('order_number', 'like', "%{$search}%");
                    });
            });
        }

        $rows = $query->orderByDesc('inspection_date')->orderByDesc('id')->paginate((int) $request->get('per_page', 100));

        $reportSummary = [
            'total_inspections' => (clone $query)->count(),
            'approved_batches' => (clone $query)->where('quality_status', 'approved')->count(),
            'rejected_batches' => (clone $query)->where('quality_status', 'rejected')->count(),
            'hold_batches' => (clone $query)->where('quality_status', 'hold')->count(),
            'approved_quantity' => round((float) (clone $query)->sum('approved_quantity'), 3),
            'rejected_quantity' => round((float) (clone $query)->sum('rejected_quantity'), 3),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'data' => $rows->items(),
                'meta' => [
                    'current_page' => $rows->currentPage(),
                    'last_page' => $rows->lastPage(),
                    'per_page' => $rows->perPage(),
                    'total' => $rows->total(),
                ],
                'summary' => $reportSummary,
            ],
            'message' => 'QC inspections retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'production_order_id' => 'required|exists:production_orders,id',
            'inspection_date' => 'required|date',
            'inspector_name' => 'required|string|max:120',
            'quality_status' => 'required|in:approved,rejected,hold',
            'approved_quantity' => 'nullable|numeric|min:0',
            'rejected_quantity' => 'nullable|numeric|min:0',
            'food_safety_checklist' => 'nullable|array',
            'food_safety_checklist.temperature_check' => 'nullable|boolean',
            'food_safety_checklist.hygiene_check' => 'nullable|boolean',
            'food_safety_checklist.packaging_check' => 'nullable|boolean',
            'food_safety_checklist.label_check' => 'nullable|boolean',
            'defects_notes' => 'nullable|string',
            'rejection_reason' => 'nullable|string',
            'report_notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $inspection = QcInspection::create([
            'production_order_id' => $request->production_order_id,
            'inspection_date' => $request->inspection_date,
            'inspector_name' => $request->inspector_name,
            'quality_status' => $request->quality_status,
            'approved_quantity' => $request->approved_quantity ?? 0,
            'rejected_quantity' => $request->rejected_quantity ?? 0,
            'food_safety_checklist' => $request->food_safety_checklist,
            'defects_notes' => $request->defects_notes,
            'rejection_reason' => $request->rejection_reason,
            'report_notes' => $request->report_notes,
        ])->load([
            'productionOrder:id,product_id,batch_no,production_quantity,produced_quantity,wastage_quantity,status,started_at,completed_at',
            'productionOrder.product:id,name,code,unit',
            'productionOrder.plan:id,order_number,plan_date,shift',
        ]);

        return response()->json([
            'success' => true,
            'data' => $inspection,
            'message' => 'QC inspection saved successfully',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $inspection = QcInspection::find($id);
        if (!$inspection) {
            return response()->json([
                'success' => false,
                'message' => 'QC inspection not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'inspection_date' => 'sometimes|date',
            'inspector_name' => 'sometimes|string|max:120',
            'quality_status' => 'sometimes|in:approved,rejected,hold',
            'approved_quantity' => 'nullable|numeric|min:0',
            'rejected_quantity' => 'nullable|numeric|min:0',
            'food_safety_checklist' => 'nullable|array',
            'food_safety_checklist.temperature_check' => 'nullable|boolean',
            'food_safety_checklist.hygiene_check' => 'nullable|boolean',
            'food_safety_checklist.packaging_check' => 'nullable|boolean',
            'food_safety_checklist.label_check' => 'nullable|boolean',
            'defects_notes' => 'nullable|string',
            'rejection_reason' => 'nullable|string',
            'report_notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $inspection->update($request->only([
            'inspection_date',
            'inspector_name',
            'quality_status',
            'approved_quantity',
            'rejected_quantity',
            'food_safety_checklist',
            'defects_notes',
            'rejection_reason',
            'report_notes',
        ]));

        return response()->json([
            'success' => true,
            'data' => $inspection->fresh([
                'productionOrder:id,product_id,batch_no,production_quantity,produced_quantity,wastage_quantity,status,started_at,completed_at',
                'productionOrder.product:id,name,code,unit',
                'productionOrder.plan:id,order_number,plan_date,shift',
            ]),
            'message' => 'QC inspection updated successfully',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $inspection = QcInspection::find($id);
        if (!$inspection) {
            return response()->json([
                'success' => false,
                'message' => 'QC inspection not found',
            ], 404);
        }

        $linkedPackagingCount = PackagingBatch::where('qc_inspection_id', $inspection->id)->count();
        if ($linkedPackagingCount > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove this QC inspection because packaging batches are already linked to it.',
            ], 422);
        }

        $inspection->delete();

        return response()->json([
            'success' => true,
            'message' => 'QC inspection removed successfully',
        ]);
    }
}
