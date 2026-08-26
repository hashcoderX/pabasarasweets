<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;
use App\Models\Employee;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AttendanceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');
        $month = $request->input('month'); // YYYY-MM
        $date = $request->input('date'); // YYYY-MM-DD
        $requestedPerPage = (int) $request->input('per_page', $date ? 1000 : 15);
        $perPage = max(1, min($requestedPerPage, 5000));

        $query = Attendance::with('employee');

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($month) {
            $query->whereRaw("DATE_FORMAT(date, '%Y-%m') = ?", [$month]);
        }

        if ($date) {
            $query->where('date', $date);
        }

        $attendance = $query->orderBy('date', 'desc')->paginate($perPage);

        return response()->json($attendance);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tenant_id' => 'required|exists:companies,id',
            'branch_id' => 'required|exists:companies,id',
            'employee_id' => 'required|exists:employees,id',
            'date' => 'required|date',
            'in_time' => 'nullable|date_format:H:i',
            'out_time' => 'nullable|date_format:H:i|after:in_time',
            'status' => 'required|in:present,absent,late,half_day',
            'notes' => 'nullable|string',
        ]);

        // Calculate work hours if both times are present
        if ($validated['in_time'] && $validated['out_time']) {
            $inTime = Carbon::createFromFormat('H:i', $validated['in_time']);
            $outTime = Carbon::createFromFormat('H:i', $validated['out_time']);
            $validated['work_hours'] = $outTime->diffInHours($inTime, true);
        }

        $attendance = Attendance::create($validated);

        return response()->json($attendance->load('employee'), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Attendance $attendance): JsonResponse
    {
        return response()->json($attendance->load('employee'));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Attendance $attendance): JsonResponse
    {
        $validated = $request->validate([
            'in_time' => 'nullable|date_format:H:i',
            'out_time' => 'nullable|date_format:H:i|after:in_time',
            'status' => 'sometimes|required|in:present,absent,late,half_day',
            'notes' => 'nullable|string',
        ]);

        // Recalculate work hours
        if (isset($validated['in_time']) && isset($validated['out_time'])) {
            $inTime = Carbon::createFromFormat('H:i', $validated['in_time']);
            $outTime = Carbon::createFromFormat('H:i', $validated['out_time']);
            $validated['work_hours'] = $outTime->diffInHours($inTime, true);
        }

        $attendance->update($validated);

        return response()->json($attendance->load('employee'));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Attendance $attendance): JsonResponse
    {
        $attendance->delete();

        return response()->json(['message' => 'Attendance record deleted successfully']);
    }

    /**
     * Get monthly attendance report
     */
    public function monthlyReport(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_id' => 'required|exists:companies,id',
            'branch_id' => 'sometimes|exists:companies,id',
            'month' => 'required|date_format:Y-m',
        ]);

        $tenantId = $request->tenant_id;
        $branchId = $request->branch_id;
        $month = $request->month;

        $query = Attendance::where('tenant_id', $tenantId)
            ->whereRaw("DATE_FORMAT(date, '%Y-%m') = ?", [$month])
            ->with('employee');

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $attendanceRecords = $query->get();

        $report = $attendanceRecords->groupBy('employee_id')->map(function ($records, $employeeId) {
            $employee = $records->first()->employee;
            $totalDays = $records->count();
            $presentDays = $records->where('status', 'present')->count();
            $absentDays = $records->where('status', 'absent')->count();
            $lateDays = $records->where('status', 'late')->count();
            $totalHours = $records->sum('work_hours');

            return [
                'employee' => $employee,
                'total_days' => $totalDays,
                'present_days' => $presentDays,
                'absent_days' => $absentDays,
                'late_days' => $lateDays,
                'total_hours' => $totalHours,
                'attendance_percentage' => $totalDays > 0 ? round(($presentDays / $totalDays) * 100, 2) : 0,
            ];
        })->values();

        return response()->json([
            'month' => $month,
            'report' => $report,
        ]);
    }

    /**
     * Basic mark attendance: minimal payload, easy to operate.
     */
    public function markBasic(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'employee_id' => 'required|exists:employees,id',
                'status' => 'required|in:present,absent,late,half_day',
                'date' => 'nullable|date',
                'in_time' => 'nullable|date_format:H:i',
                'notes' => 'nullable|string',
            ]);

            $employee = Employee::findOrFail($validated['employee_id']);
            $date = $validated['date'] ?? Carbon::today()->toDateString();

            // Check if attendance already exists for this employee on this date
            $existingAttendance = Attendance::where('employee_id', $employee->id)
                ->where('date', $date)
                ->first();

            if ($existingAttendance) {
                return response()->json([
                    'error' => 'Attendance already marked',
                    'message' => 'This employee has already been marked for attendance on ' . $date,
                    'existing_record' => $existingAttendance->load('employee')
                ], 409); // Conflict status code
            }

            // Ensure branch_id exists, default to first available company
            $branchId = $employee->branch_id;
            if (!$branchId || !DB::table('companies')->where('id', $branchId)->exists()) {
                $firstCompany = DB::table('companies')->first();
                if ($firstCompany) {
                    $branchId = $firstCompany->id;
                } else {
                    return response()->json([
                        'error' => 'No companies found',
                        'message' => 'Please create at least one company before marking attendance'
                    ], 400);
                }
            }

            $tenantId = $branchId; // Use the same for tenant

            $data = [
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'employee_id' => $employee->id,
                'date' => $date,
                'status' => $validated['status'],
                'notes' => $validated['notes'] ?? null,
                'in_time' => $validated['in_time'] ?? null,
                'work_hours' => null,
            ];

            // Calculate work hours if both in_time and out_time are provided
            // Note: out_time is not set in markBasic, only in markOut
            if ($validated['in_time'] && false) { // Always false since we don't set out_time in markBasic
                $inTime = Carbon::createFromFormat('H:i', $validated['in_time']);
                $outTime = Carbon::createFromFormat('H:i', $validated['out_time']);
                $workHours = $outTime->diffInMinutes($inTime) / 60;
                $data['work_hours'] = round($workHours, 2);
            }

            $attendance = Attendance::create($data);

            return response()->json($attendance->load('employee'), 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'message' => 'Invalid input data',
                'errors' => $e->errors()
            ], 422);
        } catch (\Illuminate\Database\QueryException $e) {
            // Handle database constraint violations
            if ($e->getCode() == 23000) { // Integrity constraint violation
                return response()->json([
                    'error' => 'Database constraint violation',
                    'message' => 'Attendance record already exists or foreign key constraint failed'
                ], 409);
            }
            return response()->json([
                'error' => 'Database error',
                'message' => $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Internal server error',
                'message' => $e->getMessage(),
                'line' => $e->getLine(),
                'file' => $e->getFile()
            ], 500);
        }
    }

    /**
     * Upload CSV file to bulk mark attendance
     */
    public function uploadCsv(Request $request): JsonResponse
    {
        $request->validate([
            'csv_file' => 'required|file|mimes:csv,txt|max:2048', // 2MB max
        ]);

        $file = $request->file('csv_file');
        $path = $file->getRealPath();
        $data = array_map('str_getcsv', file($path));

        if (empty($data)) {
            return response()->json(['error' => 'CSV file is empty'], 400);
        }

        $rawHeader = array_shift($data); // Remove header row
        $header = array_map(function ($value) {
            return $this->normalizeCsvHeader((string) $value);
        }, $rawHeader);

        $aliases = [
            'employee_code' => ['employee_code', 'employee_id', 'emp_id', 'empcode', 'employeecode'],
            'employee_name' => ['employee_name', 'name', 'employee'],
            'date' => ['date', 'attendance_date'],
            'in_time' => ['in_time', 'check_in', 'checkin', 'time_in'],
            'out_time' => ['out_time', 'check_out', 'checkout', 'time_out'],
            'total_hours' => ['total_hours', 'work_hours', 'hours'],
            'status' => ['status', 'attendance_status'],
            'device_id' => ['device_id', 'device', 'machine_id', 'terminal_id'],
            'notes' => ['notes', 'note', 'remark', 'remarks', 'comment'],
        ];

        $indexes = [];
        foreach ($aliases as $canonical => $possible) {
            $indexes[$canonical] = null;
            foreach ($possible as $candidate) {
                $idx = array_search($candidate, $header, true);
                if ($idx !== false) {
                    $indexes[$canonical] = $idx;
                    break;
                }
            }
        }

        if ($indexes['employee_code'] === null || $indexes['date'] === null) {
            return response()->json([
                'error' => 'Missing required headers. CSV must contain Employee_ID/employee_code and Date columns.',
            ], 400);
        }

        $firstCompany = DB::table('companies')->first();
        if (!$firstCompany) {
            return response()->json([
                'error' => 'No companies found',
                'message' => 'Please create at least one company before uploading attendance.',
            ], 400);
        }

        $createdRecords = [];
        $createdCount = 0;
        $updatedCount = 0;
        $skippedCount = 0;
        $errors = [];

        foreach ($data as $rowIndex => $row) {
            $lineNo = $rowIndex + 2;

            if (count(array_filter($row, function ($value) {
                return trim((string) $value) !== '';
            })) === 0) {
                $skippedCount++;
                continue;
            }

            if (count($row) < count($header)) {
                $row = array_pad($row, count($header), '');
            }

            $employeeCode = trim((string) ($indexes['employee_code'] !== null ? $row[$indexes['employee_code']] : ''));
            $employeeName = trim((string) ($indexes['employee_name'] !== null ? $row[$indexes['employee_name']] : ''));
            $dateRaw = trim((string) ($indexes['date'] !== null ? $row[$indexes['date']] : ''));
            $inRaw = trim((string) ($indexes['in_time'] !== null ? $row[$indexes['in_time']] : ''));
            $outRaw = trim((string) ($indexes['out_time'] !== null ? $row[$indexes['out_time']] : ''));
            $hoursRaw = trim((string) ($indexes['total_hours'] !== null ? $row[$indexes['total_hours']] : ''));
            $statusRaw = trim((string) ($indexes['status'] !== null ? $row[$indexes['status']] : ''));
            $deviceId = trim((string) ($indexes['device_id'] !== null ? $row[$indexes['device_id']] : ''));
            $notesRaw = trim((string) ($indexes['notes'] !== null ? $row[$indexes['notes']] : ''));

            if ($employeeCode === '') {
                $errors[] = "Row {$lineNo}: Employee_ID is required.";
                continue;
            }

            if ($dateRaw === '') {
                $errors[] = "Row {$lineNo}: Date is required.";
                continue;
            }

            $employee = Employee::whereRaw('LOWER(employee_code) = ?', [strtolower($employeeCode)])->first();
            if (!$employee) {
                $errors[] = "Row {$lineNo}: Employee code {$employeeCode} not found.";
                continue;
            }

            try {
                $date = Carbon::parse($dateRaw)->toDateString();
            } catch (\Exception $e) {
                $errors[] = "Row {$lineNo}: Invalid date {$dateRaw}.";
                continue;
            }

            $inTime = $this->parseCsvTime($inRaw);
            $outTime = $this->parseCsvTime($outRaw);

            if ($inRaw !== '' && !$inTime) {
                $errors[] = "Row {$lineNo}: Invalid Check_In time {$inRaw}. Use HH:MM format.";
                continue;
            }

            if ($outRaw !== '' && !$outTime) {
                $errors[] = "Row {$lineNo}: Invalid Check_Out time {$outRaw}. Use HH:MM format.";
                continue;
            }

            $status = $this->normalizeAttendanceStatus($statusRaw, $inTime, $outTime);
            if (!$status) {
                $errors[] = "Row {$lineNo}: Invalid status {$statusRaw}. Allowed: Present, Absent, Late, Half Day.";
                continue;
            }

            $workHours = $this->parseCsvTotalHours($hoursRaw);
            if ($hoursRaw !== '' && $workHours === null) {
                $errors[] = "Row {$lineNo}: Invalid Total_Hours {$hoursRaw}. Use HH:MM or decimal hours.";
                continue;
            }

            if ($workHours === null && $inTime && $outTime) {
                $inAt = Carbon::createFromFormat('H:i:s', $inTime);
                $outAt = Carbon::createFromFormat('H:i:s', $outTime);
                $workHours = round($outAt->diffInMinutes($inAt, true) / 60, 2);
            }

            $notesParts = [];
            if ($notesRaw !== '') {
                $notesParts[] = $notesRaw;
            }
            if ($deviceId !== '') {
                $notesParts[] = "Device ID: {$deviceId}";
            }
            if ($employeeName !== '') {
                $notesParts[] = "Device Name: {$employeeName}";
            }

            $branchId = $employee->branch_id;
            if (!$branchId || !DB::table('companies')->where('id', $branchId)->exists()) {
                $branchId = $firstCompany->id;
            }

            $payload = [
                'tenant_id' => $branchId,
                'branch_id' => $branchId,
                'status' => $status,
                'in_time' => $inTime,
                'out_time' => $outTime,
                'work_hours' => $workHours,
                'notes' => !empty($notesParts) ? implode(' | ', $notesParts) : null,
            ];

            try {
                $attendance = Attendance::updateOrCreate(
                    ['employee_id' => $employee->id, 'date' => $date],
                    $payload
                );

                if ($attendance->wasRecentlyCreated) {
                    $createdCount++;
                } else {
                    $updatedCount++;
                }

                $createdRecords[] = $attendance->load('employee');
            } catch (\Exception $e) {
                $errors[] = "Row {$lineNo}: Failed to save record - {$e->getMessage()}";
            }
        }

        return response()->json([
            'message' => 'CSV upload processed',
            'created_records' => $createdCount,
            'updated_records' => $updatedCount,
            'skipped_rows' => $skippedCount,
            'errors' => $errors,
            'data' => $createdRecords,
        ], 200);
    }

    private function normalizeCsvHeader(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = str_replace([' ', '-', '/'], '_', $normalized);
        $normalized = preg_replace('/_+/', '_', $normalized);
        return trim((string) $normalized, '_');
    }

    private function parseCsvTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $formats = ['H:i', 'H:i:s'];
        foreach ($formats as $format) {
            try {
                return Carbon::createFromFormat($format, $value)->format('H:i:s');
            } catch (\Exception $e) {
                // Try next format.
            }
        }

        return null;
    }

    private function normalizeAttendanceStatus(string $value, ?string $inTime, ?string $outTime): ?string
    {
        $normalized = strtolower(trim($value));

        if ($normalized === '' && ($inTime || $outTime)) {
            return 'present';
        }

        if ($normalized === '' && !$inTime && !$outTime) {
            return 'absent';
        }

        $map = [
            'present' => 'present',
            'p' => 'present',
            'absent' => 'absent',
            'a' => 'absent',
            'late' => 'late',
            'l' => 'late',
            'half_day' => 'half_day',
            'half-day' => 'half_day',
            'half day' => 'half_day',
            'halfday' => 'half_day',
            'hd' => 'half_day',
        ];

        return $map[$normalized] ?? null;
    }

    private function parseCsvTotalHours(string $value): ?float
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        if (preg_match('/^\d{1,2}:\d{2}$/', $value) === 1) {
            [$hours, $minutes] = explode(':', $value);
            return round(((int) $hours) + (((int) $minutes) / 60), 2);
        }

        if (is_numeric($value)) {
            return round((float) $value, 2);
        }

        return null;
    }

    /**
     * Get attendance history for a specific employee
     */
    public function getEmployeeAttendance(Request $request, $employeeId): JsonResponse
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
        ]);

        $employee = Employee::findOrFail($employeeId);

        $query = Attendance::where('employee_id', $employeeId)->with('employee');

        if ($request->start_date) {
            $query->where('date', '>=', $request->start_date);
        }

        if ($request->end_date) {
            $query->where('date', '<=', $request->end_date);
        }

        $attendance = $query->orderBy('date', 'desc')->get();

        return response()->json([
            'employee' => $employee,
            'attendance' => $attendance,
        ]);
    }

    /**
     * Mark out time for existing attendance record
     */
    public function markOut(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'employee_id' => 'required|exists:employees,id',
                'out_time' => 'required|date_format:H:i',
                'date' => 'nullable|date',
                'notes' => 'nullable|string',
            ]);

            $employee = Employee::findOrFail($validated['employee_id']);
            $date = $validated['date'] ?? Carbon::today()->toDateString();

            // Find existing attendance record for this employee on this date
            $attendance = Attendance::where('employee_id', $employee->id)
                ->where('date', $date)
                ->first();

            if (!$attendance) {
                Log::info('Mark out failed: No attendance record found', [
                    'employee_id' => $employee->id,
                    'date' => $date,
                    'validated' => $validated
                ]);
                return response()->json([
                    'error' => 'No attendance record found',
                    'message' => 'This employee has not been marked present for ' . $date,
                ], 404);
            }

            if ($attendance->out_time) {
                Log::info('Mark out failed: Already marked out', [
                    'attendance_id' => $attendance->id,
                    'existing_out_time' => $attendance->out_time
                ]);
                return response()->json([
                    'error' => 'Already marked out',
                    'message' => 'This employee has already been marked out for ' . $date,
                    'existing_record' => $attendance
                ], 409);
            }

            // Update the attendance record with out_time
            $normalizedOutTime = Carbon::createFromFormat('H:i', $validated['out_time'])->format('H:i:s');
            $attendance->out_time = $normalizedOutTime;

            // Calculate work hours if in_time exists
            if ($attendance->in_time) {
                try {
                    $inTime = Carbon::createFromFormat('H:i:s', $attendance->in_time);
                    $outTime = Carbon::createFromFormat('H:i:s', $normalizedOutTime);
                    $workHours = $outTime->diffInMinutes($inTime, true) / 60; // true = always positive
                    $attendance->work_hours = round($workHours, 2);
                } catch (\Exception $e) {
                    // If time parsing fails, don't calculate work hours
                    // This prevents the 500 error
                }
            }

            // Update notes if provided
            if (!empty($validated['notes'])) {
                $attendance->notes = $validated['notes'];
            }

            try {
                $attendance->save();
            } catch (\Exception $e) {
                Log::error('Mark out save failed', [
                    'attendance_id' => $attendance->id,
                    'error' => $e->getMessage()
                ]);
                throw $e;
            }

            return response()->json([
                'message' => 'Marked out successfully',
                'attendance' => $attendance
            ], 200);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'message' => 'Invalid input data',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Internal server error',
                'message' => $e->getMessage(),
                'line' => $e->getLine(),
                'file' => $e->getFile()
            ], 500);
        }
    }
}
