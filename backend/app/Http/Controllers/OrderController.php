<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Dedicated controller boundary for the dashboard order workflow.
 *
 * The inherited workflow implementation is kept temporarily to preserve the
 * established order behavior while orders and outlet POS are separated at the
 * API boundary. New order-specific changes should be made here as the workflow
 * is incrementally extracted from the POS controller.
 */
class OrderController extends OutletPosController
{
    /**
     * Create an order. The order form no longer asks for prices, so any line
     * without a unit_price is priced from the item master (sell price, falling
     * back to unit price). DO and invoice creation copy these line prices, and
     * prices can still be adjusted when the invoice is created.
     */
    public function store(Request $request): JsonResponse
    {
        $items = $request->input('items');

        if (is_array($items) && !empty($items)) {
            $itemIds = collect($items)
                ->pluck('inventory_item_id')
                ->filter(fn ($id) => is_numeric($id) && (int) $id > 0)
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();

            $priceById = empty($itemIds) ? collect() : DB::table('inventory_items')
                ->whereIn('id', $itemIds)
                ->get(['id', 'sell_price', 'unit_price'])
                ->keyBy('id');

            $request->merge([
                'items' => array_map(function ($item) use ($priceById) {
                    if (!is_array($item)) {
                        return $item;
                    }
                    $hasPrice = array_key_exists('unit_price', $item) && $item['unit_price'] !== null && $item['unit_price'] !== '';
                    if (!$hasPrice) {
                        $master = $priceById->get((int) ($item['inventory_item_id'] ?? 0));
                        $item['unit_price'] = $master
                            ? (float) ($master->sell_price ?? $master->unit_price ?? 0)
                            : 0;
                    }
                    return $item;
                }, $items),
            ]);
        }

        return parent::store($request);
    }

    /**
     * Permanently delete an order and its lines.
     *
     * Only orders that have not moved on are deletable: status pending/rejected,
     * no DO or invoice generated, and no payment recorded (paid orders feed the
     * outlet's daily cash summary, so they must be rejected instead).
     */
    public function destroy(Request $request, int $orderId): JsonResponse
    {
        if (!Schema::hasTable('orders')) {
            return response()->json(['success' => false, 'message' => 'Orders table is not available'], 422);
        }

        $orderQuery = $this->accessibleOrderQuery($request);
        if (!$orderQuery) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            $orderNumber = DB::transaction(function () use ($orderQuery, $orderId) {
                $order = $orderQuery->where('o.id', $orderId)->lockForUpdate()
                    ->first(['o.id', 'o.order_number', 'o.status', 'o.do_number', 'o.invoice_number', 'o.paid_amount']);

                if (!$order) {
                    throw new \RuntimeException('Order not found.');
                }

                $status = strtolower((string) ($order->status ?? 'pending'));
                if (!in_array($status, ['pending', 'rejected'], true)) {
                    throw new \RuntimeException('Only pending or rejected orders can be deleted.');
                }
                if (!empty($order->do_number) || !empty($order->invoice_number)) {
                    throw new \RuntimeException('This order already has a DO or invoice and cannot be deleted.');
                }
                if ((float) ($order->paid_amount ?? 0) > 0) {
                    throw new \RuntimeException('A payment was recorded for this order. Reject it instead of deleting.');
                }

                if (Schema::hasTable('order_items')) {
                    DB::table('order_items')->where('order_id', $orderId)->delete();
                }
                DB::table('orders')->where('id', $orderId)->delete();

                return (string) $order->order_number;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);
            return response()->json(['success' => false, 'message' => 'Failed to delete order'], 500);
        }

        return response()->json([
            'success' => true,
            'message' => "Order {$orderNumber} deleted successfully",
        ]);
    }
}
