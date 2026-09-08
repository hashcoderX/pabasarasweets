<?php

namespace App\Http\Controllers;

use App\Models\DistributionCustomer;
use App\Models\Load;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DistributionCustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DistributionCustomer::with('route:id,name,origin,destination');

        $user = $request->user();

        if ($user) {
            $isAdmin = (!$user->employee_id) || $user->hasRole('Super Admin');

            if (!$isAdmin && $user->employee_id) {
                $loads = Load::with('loadRoutes:load_id,route_id')
                    ->select(['id', 'route_id'])
                    ->where('sales_ref_id', $user->employee_id)
                    ->whereIn('status', ['pending', 'in_transit', 'delivered'])
                    ->get();

                $routeIds = $loads
                    ->flatMap(function ($load) {
                        $baseRouteId = $load->route_id ? [$load->route_id] : [];
                        $extraRouteIds = $load->loadRoutes->pluck('route_id')->all();
                        return array_merge($baseRouteId, $extraRouteIds);
                    })
                    ->filter()
                    ->unique()
                    ->toArray();

                if (!empty($routeIds)) {
                    $query->whereIn('route_id', $routeIds);
                } else {
                    // No allocated routes for this sales ref - hide customers
                    $query->whereRaw('1 = 0');
                }
            }
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('shop_name', 'like', "%{$search}%")
                    ->orWhere('customer_code', 'like', "%{$search}%")
                    ->orWhere('owner_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $customers = $query->orderByDesc('created_at')->paginate($request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data' => $customers,
            'message' => 'Distribution customers retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'shop_name' => 'required|string|max:255',
            'customer_code' => 'required|string|max:50|unique:distribution_customers,customer_code',
            'owner_name' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:30',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'route_id' => 'nullable|exists:routes,id',
            'outstanding' => 'nullable|numeric|min:0',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $customer = DistributionCustomer::create([
            ...$validator->validated(),
            'outstanding' => $request->outstanding ?? 0,
            'status' => $request->status ?? 'active',
        ]);

        return response()->json([
            'success' => true,
            'data' => $customer->load('route:id,name,origin,destination'),
            'message' => 'Distribution customer created successfully',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $customer = DistributionCustomer::with('route:id,name,origin,destination')->find($id);

        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution customer not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $customer,
            'message' => 'Distribution customer retrieved successfully',
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $customer = DistributionCustomer::find($id);

        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution customer not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'shop_name' => 'required|string|max:255',
            'customer_code' => 'required|string|max:50|unique:distribution_customers,customer_code,' . $customer->id,
            'owner_name' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:30',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'route_id' => 'nullable|exists:routes,id',
            'outstanding' => 'nullable|numeric|min:0',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $customer->update($validator->validated());

        return response()->json([
            'success' => true,
            'data' => $customer->load('route:id,name,origin,destination'),
            'message' => 'Distribution customer updated successfully',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $customer = DistributionCustomer::find($id);

        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution customer not found',
            ], 404);
        }

        $customer->delete();

        return response()->json([
            'success' => true,
            'message' => 'Distribution customer deleted successfully',
        ]);
    }
}
