<?php

namespace App\Services\Attendance;

use App\Models\Attendance;
use App\Models\BiometricPunchLog;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Turns a single biometric punch into an attendance IN/OUT update.
 *
 * Rules per employee per day:
 *  - first punch            => IN
 *  - later punches          => OUT (the latest punch of the day wins)
 *  - punch within the double-tap window of IN/OUT => ignored as duplicate
 *  - explicit device direction (Clock in / Clock out keys) overrides the auto rule
 */
class BiometricPunchProcessor
{
    private const DOUBLE_TAP_SECONDS = 120;

    /**
     * @param array{device_user_id:string, punch_time:Carbon|string, direction?:string, verify_mode?:int|null,
     *              device_mac?:string|null, source_ip?:string|null, source?:string, raw_hex?:string|null, notes?:string|null} $event
     * @return array{result:string, message:string, employee_id:int|null, attendance_id:int|null}
     */
    public function process(array $event): array
    {
        $deviceUserId = trim((string) $event['device_user_id']);
        $punchAt = $event['punch_time'] instanceof Carbon
            ? $event['punch_time']->copy()
            : Carbon::parse((string) $event['punch_time']);
        $direction = in_array($event['direction'] ?? 'auto', ['in', 'out'], true) ? $event['direction'] : 'auto';

        if (BiometricPunchLog::query()->where('device_user_id', $deviceUserId)->where('punch_time', $punchAt)->exists()) {
            return [
                'result' => 'duplicate',
                'message' => 'Punch already received earlier.',
                'employee_id' => null,
                'attendance_id' => null,
            ];
        }

        $employee = $this->resolveEmployee($deviceUserId);

        $outcome = $employee
            ? $this->applyToAttendance($employee, $punchAt, $direction, $event)
            : [
                'result' => 'unmatched',
                'message' => "No employee linked to device user {$deviceUserId}.",
                'attendance_id' => null,
            ];

        $this->writeLog($event, $deviceUserId, $punchAt, $direction, $employee?->id, $outcome);

        return $outcome + ['employee_id' => $employee?->id];
    }

    /**
     * Re-applies an earlier unmatched punch (e.g. after the employee code was fixed).
     */
    public function reprocess(BiometricPunchLog $log): array
    {
        $employee = $this->resolveEmployee((string) $log->device_user_id);
        if (!$employee) {
            return ['result' => 'unmatched', 'message' => "No employee linked to device user {$log->device_user_id}."];
        }

        $outcome = $this->applyToAttendance($employee, $log->punch_time->copy(), (string) $log->direction, []);
        $log->update([
            'employee_id' => $employee->id,
            'result' => $outcome['result'],
            'message' => $outcome['message'],
        ]);

        return $outcome;
    }

    /**
     * Exact employee_code match first, then numeric match (device user 1 => EMP0001).
     */
    public function resolveEmployee(string $deviceUserId): ?Employee
    {
        if ($deviceUserId === '') {
            return null;
        }

        $exact = Employee::query()
            ->whereRaw('LOWER(employee_code) = ?', [strtolower($deviceUserId)])
            ->first();
        if ($exact) {
            return $exact;
        }

        $numeric = ltrim(preg_replace('/\D/', '', $deviceUserId) ?? '', '0');
        if ($numeric === '') {
            return null;
        }

        return Employee::query()
            ->get(['id', 'employee_code', 'branch_id'])
            ->first(function (Employee $employee) use ($numeric) {
                $codeDigits = ltrim(preg_replace('/\D/', '', (string) $employee->employee_code) ?? '', '0');
                return $codeDigits !== '' && $codeDigits === $numeric;
            });
    }

    private function applyToAttendance(Employee $employee, Carbon $punchAt, string $direction, array $event): array
    {
        return DB::transaction(function () use ($employee, $punchAt, $direction, $event) {
            $date = $punchAt->toDateString();
            $punchTime = $punchAt->format('H:i:s');

            $attendance = Attendance::query()
                ->where('employee_id', $employee->id)
                ->where('date', $date)
                ->lockForUpdate()
                ->first();

            if (!$attendance) {
                $branchId = $this->resolveBranchId($employee);
                if (!$branchId) {
                    return ['result' => 'error', 'message' => 'No company configured.', 'attendance_id' => null];
                }

                $attendance = new Attendance();
                $attendance->tenant_id = $branchId;
                $attendance->branch_id = $branchId;
                $attendance->employee_id = $employee->id;
                $attendance->date = $date;
                $attendance->status = 'present';
            }

            $inTime = $attendance->in_time ? $this->normalizeTime($attendance->in_time) : null;
            $outTime = $attendance->out_time ? $this->normalizeTime($attendance->out_time) : null;

            if ($this->isDoubleTap($punchTime, $inTime) || $this->isDoubleTap($punchTime, $outTime)) {
                return [
                    'result' => 'ignored',
                    'message' => 'Repeated punch within ' . self::DOUBLE_TAP_SECONDS . ' seconds.',
                    'attendance_id' => $attendance->id,
                ];
            }

            $marked = null;
            if ($direction === 'out') {
                if ($inTime && $punchTime > $inTime && (!$outTime || $punchTime > $outTime)) {
                    $outTime = $punchTime;
                    $marked = 'out';
                }
            } elseif (!$inTime || $punchTime < $inTime) {
                if ($inTime && $direction === 'auto' && !$outTime) {
                    // An earlier punch arrived late (offline replay): the previous IN becomes the OUT.
                    $outTime = $inTime;
                }
                $inTime = $punchTime;
                $marked = 'in';
            } elseif ($direction === 'auto' && (!$outTime || $punchTime > $outTime)) {
                $outTime = $punchTime;
                $marked = 'out';
            }

            if ($marked === null) {
                return [
                    'result' => 'ignored',
                    'message' => 'Punch does not change the recorded IN/OUT times.',
                    'attendance_id' => $attendance->id,
                ];
            }

            $attendance->in_time = $inTime;
            $attendance->out_time = $outTime;
            $attendance->work_hours = $inTime && $outTime
                ? round(abs(Carbon::createFromFormat('H:i:s', $outTime)->diffInMinutes(Carbon::createFromFormat('H:i:s', $inTime))) / 60, 2)
                : null;
            $attendance->notes = $this->appendNote($attendance->notes, $event);
            $attendance->save();

            return [
                'result' => $marked === 'in' ? 'marked_in' : 'marked_out',
                'message' => ($marked === 'in' ? 'IN' : 'OUT') . " marked at {$punchTime} on {$date}.",
                'attendance_id' => $attendance->id,
            ];
        });
    }

    private function writeLog(array $event, string $deviceUserId, Carbon $punchAt, string $direction, ?int $employeeId, array $outcome): void
    {
        try {
            BiometricPunchLog::create([
                'device_user_id' => $deviceUserId,
                'employee_id' => $employeeId,
                'punch_time' => $punchAt,
                'direction' => $direction,
                'verify_mode' => $event['verify_mode'] ?? null,
                'device_mac' => $event['device_mac'] ?? null,
                'source_ip' => $event['source_ip'] ?? null,
                'source' => $event['source'] ?? 'realtime_push',
                'raw_hex' => $event['raw_hex'] ?? null,
                'result' => $outcome['result'],
                'message' => $outcome['message'],
            ]);
        } catch (QueryException $e) {
            // A concurrent retransmission already logged this punch.
            if ((string) $e->getCode() !== '23000') {
                throw $e;
            }
        }
    }

    private function resolveBranchId(Employee $employee): ?int
    {
        if ($employee->branch_id && DB::table('companies')->where('id', $employee->branch_id)->exists()) {
            return (int) $employee->branch_id;
        }

        $firstCompanyId = DB::table('companies')->value('id');
        return $firstCompanyId ? (int) $firstCompanyId : null;
    }

    private function isDoubleTap(string $punchTime, ?string $existing): bool
    {
        if (!$existing) {
            return false;
        }

        $diff = abs(Carbon::createFromFormat('H:i:s', $punchTime)->diffInSeconds(Carbon::createFromFormat('H:i:s', $existing)));
        return $diff < self::DOUBLE_TAP_SECONDS;
    }

    private function normalizeTime(string $value): string
    {
        return Carbon::parse($value)->format('H:i:s');
    }

    private function appendNote(?string $existing, array $event): string
    {
        $parts = array_filter(array_map('trim', explode('|', (string) $existing)));
        $parts[] = 'Source: biometric';
        if (!empty($event['notes'])) {
            $parts[] = trim((string) $event['notes']);
        }

        return implode(' | ', array_values(array_unique($parts)));
    }
}
