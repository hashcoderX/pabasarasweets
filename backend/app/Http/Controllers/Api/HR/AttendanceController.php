<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Console\Commands\AttendanceListen;
use App\Models\AttendanceDeviceSetting;
use App\Models\BiometricDevicePacket;
use App\Models\BiometricPunchLog;
use App\Services\Attendance\BiometricPacketIngestor;
use App\Services\Attendance\BiometricPunchProcessor;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;
use App\Models\Employee;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;

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

    /**
     * Get biometric device settings used by the attendance bridge.
     */
    public function getDeviceSettings(): JsonResponse
    {
        $settings = AttendanceDeviceSetting::query()->latest('id')->first();

        return response()->json([
            'data' => $settings,
        ]);
    }

    /**
     * Save biometric device settings.
     */
    public function saveDeviceSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'device_name' => 'required|string|max:255',
            'communication_type' => 'required|string|max:32',
            'communication_password' => 'nullable|string|max:64',
            'dhcp_enabled' => 'required|boolean',
            'device_ip' => 'nullable|ip',
            'device_port' => 'required|integer|min:1|max:65535',
            'subnet_mask' => 'nullable|ip',
            'gateway' => 'nullable|ip',
            'dns' => 'nullable|ip',
            'real_time_push_enabled' => 'required|boolean',
            'server_host' => 'nullable|string|max:255',
            'server_port' => 'nullable|integer|min:1|max:65535',
            'p2p_service_enabled' => 'required|boolean',
            'is_active' => 'required|boolean',
            'listener_port' => 'nullable|integer|min:1|max:65535',
            'listener_allow_any_ip' => 'nullable|boolean',
            'device_timezone' => 'nullable|timezone',
        ]);
        $validated = array_filter($validated, fn ($value, $key) => $value !== null || !in_array($key, ['listener_port', 'listener_allow_any_ip', 'device_timezone'], true), ARRAY_FILTER_USE_BOTH);

        $userId = Auth::id();
        $existing = AttendanceDeviceSetting::query()->latest('id')->first();

        $settings = AttendanceDeviceSetting::query()->updateOrCreate(
            ['id' => $existing?->id ?? 1],
            array_merge($validated, [
                'created_by' => $existing?->created_by ?? $userId,
                'updated_by' => $userId,
            ])
        );

        return response()->json([
            'message' => 'Attendance device settings saved successfully.',
            'data' => $settings,
        ]);
    }

    /**
     * Test TCP connectivity to biometric device.
     */
    public function testDeviceConnection(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'device_ip' => 'nullable|ip',
            'device_port' => 'nullable|integer|min:1|max:65535',
        ]);

        $settings = AttendanceDeviceSetting::query()->latest('id')->first();
        $deviceIp = $validated['device_ip'] ?? $settings?->device_ip;
        $devicePort = $validated['device_port'] ?? $settings?->device_port ?? 5500;

        if (!$deviceIp) {
            return response()->json([
                'ok' => false,
                'message' => 'Device IP is not configured.',
            ], 422);
        }

        // Realand terminals speak a UDP protocol on the comm port; probe UDP first, then TCP as fallback.
        $protocol = null;
        $udpReplyBytes = $this->probeUdpDevice($deviceIp, (int) $devicePort);
        if ($udpReplyBytes !== null) {
            $protocol = 'UDP';
        }

        $errorNumber = 0;
        $errorMessage = '';
        if ($protocol === null) {
            $connection = @fsockopen($deviceIp, (int) $devicePort, $errorNumber, $errorMessage, 3);
            if (is_resource($connection)) {
                fclose($connection);
                $protocol = 'TCP';
            }
        }

        $isReachable = $protocol !== null;
        $successMessage = $protocol === 'UDP'
            ? "Device responded over UDP on {$deviceIp}:{$devicePort} ({$udpReplyBytes} bytes)."
            : "Connection successful to {$deviceIp}:{$devicePort} (TCP).";
        $failureMessage = "No response from {$deviceIp}:{$devicePort} over UDP or TCP. "
            . 'Check the device is powered on, on the same network, and the Local Port / Communication Password match.';

        if ($settings) {
            $settings->last_tested_at = now();
            $settings->last_test_result = $isReachable
                ? "Reachable via {$protocol} on {$deviceIp}:{$devicePort}"
                : "Failed: no UDP reply, TCP {$errorNumber} {$errorMessage}";
            $settings->updated_by = Auth::id();
            $settings->save();
        }

        return response()->json([
            'ok' => $isReachable,
            'protocol' => $protocol,
            'message' => $isReachable ? $successMessage : $failureMessage,
        ], $isReachable ? 200 : 422);
    }

    /**
     * Sends a small probe datagram and returns the reply length, or null if the device did not answer.
     */
    private function probeUdpDevice(string $ip, int $port, int $timeoutSeconds = 2): ?int
    {
        $socket = @stream_socket_client("udp://{$ip}:{$port}", $errno, $errstr, $timeoutSeconds);
        if (!$socket) {
            return null;
        }

        try {
            stream_set_timeout($socket, $timeoutSeconds);
            if (@fwrite($socket, "\x55\xAA\x01\x00") === false) {
                return null;
            }

            $reply = @fread($socket, 1024);
            $meta = stream_get_meta_data($socket);
            if ($reply === false || $reply === '' || !empty($meta['timed_out'])) {
                return null;
            }

            return strlen($reply);
        } finally {
            fclose($socket);
        }
    }

    /**
     * Receive attendance events from an external bridge / manual JSON and mark IN/OUT.
     */
    public function syncDeviceEvents(Request $request, BiometricPunchProcessor $processor): JsonResponse
    {
        $validated = $request->validate([
            'events' => 'required|array|min:1|max:5000',
            'events.*.employee_code' => 'required_without:events.*.device_user_id|nullable|string|max:100',
            'events.*.device_user_id' => 'required_without:events.*.employee_code|nullable|string|max:100',
            'events.*.punch_time' => 'required|date',
            'events.*.direction' => 'nullable|in:in,out,auto',
            'events.*.device_id' => 'nullable|string|max:100',
            'events.*.notes' => 'nullable|string|max:255',
        ]);

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        foreach ($validated['events'] as $index => $event) {
            $lineNo = $index + 1;
            $userId = trim((string) ($event['device_user_id'] ?? $event['employee_code'] ?? ''));

            try {
                $outcome = $processor->process([
                    'device_user_id' => $userId,
                    'punch_time' => Carbon::parse((string) $event['punch_time']),
                    'direction' => strtolower((string) ($event['direction'] ?? 'auto')),
                    'source' => 'bridge_api',
                    'source_ip' => $request->ip(),
                    'notes' => trim(implode(' ', array_filter([
                        !empty($event['device_id']) ? "Device: {$event['device_id']}" : null,
                        $event['notes'] ?? null,
                    ]))) ?: null,
                ]);
            } catch (\Throwable $e) {
                $errors[] = "Event {$lineNo}: {$e->getMessage()}";
                continue;
            }

            match ($outcome['result']) {
                'marked_in' => $created++,
                'marked_out' => $updated++,
                'unmatched', 'error' => $errors[] = "Event {$lineNo}: {$outcome['message']}",
                default => $skipped++,
            };
        }

        $summary = [
            'created_records' => $created,
            'updated_records' => $updated,
            'skipped_records' => $skipped,
            'error_count' => count($errors),
            'marked_in' => $created,
            'marked_out' => $updated,
        ];

        AttendanceDeviceSetting::query()->latest('id')->first()?->update([
            'last_synced_at' => now(),
            'last_sync_summary' => $summary,
            'updated_by' => Auth::id(),
        ]);

        return response()->json([
            'message' => 'Device events processed.',
            'summary' => $summary,
            'errors' => $errors,
        ]);
    }

    /**
     * Live status of the punch listener plus today's biometric counters.
     */
    public function getDeviceStatus(): JsonResponse
    {
        $settings = AttendanceDeviceSetting::query()->latest('id')->first();
        $heartbeat = $settings?->listener_heartbeat_at;
        $online = $heartbeat !== null && $heartbeat->greaterThan(now()->subSeconds(45));

        $today = now($settings?->device_timezone ?: 'Asia/Colombo')->toDateString();
        $todayLogs = BiometricPunchLog::query()
            ->whereDate('punch_time', $today)
            ->select('result', DB::raw('COUNT(*) as total'))
            ->groupBy('result')
            ->pluck('total', 'result');

        return response()->json([
            'listener' => [
                'online' => $online,
                'port' => $settings?->listener_port ?? 5055,
                'started_at' => $settings?->listener_started_at,
                'heartbeat_at' => $heartbeat,
                'last_packet_at' => $settings?->listener_last_packet_at,
                'server_ips' => AttendanceListen::localIps(),
            ],
            'today' => [
                'date' => $today,
                'marked_in' => (int) ($todayLogs['marked_in'] ?? 0),
                'marked_out' => (int) ($todayLogs['marked_out'] ?? 0),
                'unmatched' => (int) ($todayLogs['unmatched'] ?? 0),
                'ignored' => (int) (($todayLogs['ignored'] ?? 0) + ($todayLogs['duplicate'] ?? 0)),
            ],
            'unmatched_total' => BiometricPunchLog::query()->where('result', 'unmatched')->count(),
            'unparsed_packets' => BiometricDevicePacket::query()->where('status', 'unparsed')->count(),
        ]);
    }

    /**
     * Most recent punches received from the device (newest first).
     */
    public function getPunchLogs(Request $request): JsonResponse
    {
        $limit = min(max((int) $request->query('limit', 50), 1), 200);

        $logs = BiometricPunchLog::query()
            ->with('employee:id,employee_code,first_name,last_name')
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (BiometricPunchLog $log) => [
                'id' => $log->id,
                'device_user_id' => $log->device_user_id,
                'employee_id' => $log->employee_id,
                'employee_code' => $log->employee?->employee_code,
                'employee_name' => $log->employee ? trim("{$log->employee->first_name} {$log->employee->last_name}") : null,
                'punch_time' => $log->punch_time?->format('Y-m-d H:i:s'),
                'direction' => $log->direction,
                'source' => $log->source,
                'source_ip' => $log->source_ip,
                'result' => $log->result,
                'message' => $log->message,
                'received_at' => $log->created_at,
            ]);

        return response()->json(['data' => $logs]);
    }

    /**
     * Raw packets captured by the listener (newest first), for diagnosing the device format.
     */
    public function getDevicePackets(Request $request): JsonResponse
    {
        $limit = min(max((int) $request->query('limit', 30), 1), 200);
        $query = BiometricDevicePacket::query()->latest('id')->limit($limit);
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json(['data' => $query->get()]);
    }

    /**
     * Push a punch through the same pipeline the device uses (for testing without the machine).
     */
    public function testDevicePunch(Request $request, BiometricPunchProcessor $processor): JsonResponse
    {
        $validated = $request->validate([
            'device_user_id' => 'required|string|max:64',
            'punch_time' => 'nullable|date',
            'direction' => 'nullable|in:in,out,auto',
        ]);

        $settings = AttendanceDeviceSetting::query()->latest('id')->first();
        $punchAt = !empty($validated['punch_time'])
            ? Carbon::parse($validated['punch_time'])
            : now($settings?->device_timezone ?: 'Asia/Colombo')->shiftTimezone(config('app.timezone'));

        $outcome = $processor->process([
            'device_user_id' => $validated['device_user_id'],
            'punch_time' => $punchAt,
            'direction' => $validated['direction'] ?? 'auto',
            'source' => 'manual_test',
            'source_ip' => $request->ip(),
        ]);

        $ok = in_array($outcome['result'], ['marked_in', 'marked_out'], true);

        return response()->json($outcome + ['ok' => $ok], $ok || in_array($outcome['result'], ['ignored', 'duplicate'], true) ? 200 : 422);
    }

    /**
     * Run a raw payload (as the device would send it) through the parser and processor.
     */
    public function testDevicePacket(Request $request, BiometricPacketIngestor $ingestor): JsonResponse
    {
        $validated = $request->validate([
            'payload' => 'required|string|max:65535',
            'is_hex' => 'nullable|boolean',
        ]);

        $payload = $validated['payload'];
        if (!empty($validated['is_hex'])) {
            $clean = preg_replace('/[^0-9a-fA-F]/', '', $payload);
            if ($clean === '' || strlen($clean) % 2 !== 0) {
                return response()->json(['message' => 'Hex payload must contain an even number of hex digits.'], 422);
            }
            $payload = hex2bin($clean);
        }

        $result = $ingestor->ingest($payload, 'test', $request->ip(), null, 'manual_test');

        return response()->json($result, $result['events'] > 0 ? 200 : 422);
    }

    /**
     * Retry punches that arrived before the device user was linked to an employee.
     */
    public function reprocessUnmatchedPunches(BiometricPunchProcessor $processor): JsonResponse
    {
        $counts = ['marked' => 0, 'still_unmatched' => 0, 'ignored' => 0];

        BiometricPunchLog::query()
            ->where('result', 'unmatched')
            ->orderBy('punch_time')
            ->chunkById(200, function ($logs) use ($processor, &$counts) {
                foreach ($logs as $log) {
                    $outcome = $processor->reprocess($log);
                    $key = match ($outcome['result']) {
                        'marked_in', 'marked_out' => 'marked',
                        'unmatched' => 'still_unmatched',
                        default => 'ignored',
                    };
                    $counts[$key]++;
                }
            });

        return response()->json([
            'message' => "Reprocessed unmatched punches: {$counts['marked']} marked, {$counts['still_unmatched']} still unmatched.",
            'summary' => $counts,
        ]);
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
