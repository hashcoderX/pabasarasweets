<?php

namespace App\Http\Controllers;

use App\Models\DeliveryCashTransaction;
use App\Models\Load;
use App\Models\LoadExpense;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class LoadExpenseController extends Controller
{
    public function index(Load $load): JsonResponse
    {
        $rows = LoadExpense::query()
            ->where('load_id', $load->id)
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->get();

        $rows->transform(function (LoadExpense $row) {
            $row->bill_attachment_url = $row->bill_attachment_path
                ? asset('storage/' . ltrim($row->bill_attachment_path, '/'))
                : null;

            return $row;
        });

        return response()->json([
            'success' => true,
            'data' => $rows,
            'message' => 'Load expenses retrieved successfully',
        ]);
    }

    public function store(Request $request, Load $load): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'expense_date' => 'required|date',
            'expense_type' => 'required|string|max:50',
            'amount' => 'required|numeric|gt:0',
            'reference' => 'nullable|string|max:100',
            'note' => 'nullable|string',
            'bill_attachment' => 'nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $billAttachmentPath = null;

        if ($request->hasFile('bill_attachment')) {
            $billAttachmentPath = $request->file('bill_attachment')->store('load-expense-bills', 'public');
        }

        try {
            $result = DB::transaction(function () use ($request, $load, $payload, $billAttachmentPath) {
                $deliveryTx = DeliveryCashTransaction::create([
                    'date' => $payload['expense_date'],
                    'type' => 'out',
                    'amount' => $payload['amount'],
                    'reference' => $payload['reference'] ?? null,
                    'note' => $payload['note'] ?? null,
                    'created_by' => $request->user()?->id,
                ]);

                $expense = LoadExpense::create([
                    'load_id' => $load->id,
                    'expense_date' => $payload['expense_date'],
                    'expense_type' => $payload['expense_type'],
                    'amount' => $payload['amount'],
                    'reference' => $payload['reference'] ?? null,
                    'note' => $payload['note'] ?? null,
                    'bill_attachment_path' => $billAttachmentPath,
                    'bill_attachment_name' => $request->hasFile('bill_attachment')
                        ? $request->file('bill_attachment')->getClientOriginalName()
                        : null,
                    'delivery_cash_transaction_id' => $deliveryTx->id,
                    'created_by' => $request->user()?->id,
                ]);

                $expense->bill_attachment_url = $expense->bill_attachment_path
                    ? asset('storage/' . ltrim($expense->bill_attachment_path, '/'))
                    : null;

                return $expense;
            });
        } catch (\Throwable $throwable) {
            if ($billAttachmentPath) {
                Storage::disk('public')->delete($billAttachmentPath);
            }

            throw $throwable;
        }

        return response()->json([
            'success' => true,
            'data' => $result,
            'message' => 'Load expense saved and delivery cash deducted successfully',
        ], 201);
    }
}
