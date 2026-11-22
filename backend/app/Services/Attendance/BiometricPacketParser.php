<?php

namespace App\Services\Attendance;

use Carbon\Carbon;

/**
 * Extracts punch events from whatever the fingerprint terminal pushes.
 *
 * Supported payloads:
 *  - JSON (object, array, or wrapped in data/records/logs/events)
 *  - ADMS / iClock ATTLOG lines: "<pin>\t<YYYY-mm-dd HH:ii:ss>\t<state>\t<verify>..."
 *  - URL-encoded form / query strings (pin=1&time=2026-11-21 08:00:00)
 *  - Plain text lines that contain a user id and a date-time ("1,2026-11-21 08:00:00,0")
 *
 * Binary frames that match none of these are reported as unparsed so they can be inspected;
 * nothing is guessed out of binary data, so no false attendance is ever written.
 */
class BiometricPacketParser
{
    private const USER_KEYS = ['device_user_id', 'employee_code', 'user_id', 'userid', 'user', 'pin', 'enrollid', 'enroll_id', 'enrollnumber', 'emp_code', 'empcode', 'badge', 'cardno', 'id'];
    private const TIME_KEYS = ['punch_time', 'datetime', 'date_time', 'checktime', 'check_time', 'time', 'timestamp', 'time_stamp', 'logtime', 'log_time', 'attendtime', 'verifytime', 'recordtime'];
    private const DIRECTION_KEYS = ['direction', 'inout', 'in_out', 'inoutmode', 'checktype', 'check_type', 'state', 'status', 'punch', 'attstate'];
    private const VERIFY_KEYS = ['verify_mode', 'verifymode', 'verify', 'verifytype', 'mode'];

    private const DATETIME_PATTERN = '/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/';

    public function __construct(private string $deviceTimezone = 'Asia/Colombo')
    {
    }

    /**
     * @return list<array{device_user_id:string, punch_time:Carbon, direction:string, verify_mode:int|null}>
     */
    public function parse(string $payload): array
    {
        $payload = $this->stripBom($payload);
        if (trim($payload) === '' || !$this->isMostlyText($payload)) {
            return [];
        }

        $trimmed = trim($payload);

        if ($trimmed[0] === '{' || $trimmed[0] === '[') {
            $decoded = json_decode($trimmed, true);
            if (is_array($decoded)) {
                return $this->fromJson($decoded);
            }
        }

        $events = $this->fromAttlogLines($trimmed);
        if ($events) {
            return $events;
        }

        if (str_contains($trimmed, '=')) {
            $events = $this->fromKeyValue($trimmed);
            if ($events) {
                return $events;
            }
        }

        return $this->fromLooseText($trimmed);
    }

    public function isMostlyText(string $payload): bool
    {
        $length = strlen($payload);
        if ($length === 0) {
            return false;
        }

        $printable = preg_match_all('/[\x20-\x7E\t\r\n]/', $payload);
        return ($printable / $length) >= 0.9;
    }

    private function fromJson(array $decoded): array
    {
        foreach (['data', 'records', 'logs', 'events', 'record', 'log', 'punches', 'attlog'] as $wrapper) {
            if (isset($decoded[$wrapper]) && is_array($decoded[$wrapper])) {
                return $this->fromJson($decoded[$wrapper]);
            }
        }

        $rows = array_is_list($decoded) ? $decoded : [$decoded];
        $events = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $event = $this->fromAssoc($row);
            if ($event) {
                $events[] = $event;
            }
        }

        return $events;
    }

    private function fromAssoc(array $row): ?array
    {
        $normalized = [];
        foreach ($row as $key => $value) {
            if (is_scalar($value)) {
                $normalized[strtolower(str_replace([' ', '-'], '_', (string) $key))] = trim((string) $value);
            }
        }

        $userId = $this->firstValue($normalized, self::USER_KEYS);
        $time = $this->firstValue($normalized, self::TIME_KEYS);

        // Separate date + time fields.
        if ($time !== null && !preg_match('/\d{4}[-\/.]\d{1,2}/', $time) && !ctype_digit($time) && isset($normalized['date'])) {
            $time = $normalized['date'] . ' ' . $time;
        }

        if ($userId === null || $userId === '' || $time === null) {
            return null;
        }

        $punchAt = $this->parseTime($time);
        if (!$punchAt) {
            return null;
        }

        $verify = $this->firstValue($normalized, self::VERIFY_KEYS);

        return [
            'device_user_id' => $userId,
            'punch_time' => $punchAt,
            'direction' => $this->normalizeDirection($this->firstValue($normalized, self::DIRECTION_KEYS)),
            'verify_mode' => is_numeric($verify) ? (int) $verify : null,
        ];
    }

    private function fromAttlogLines(string $text): array
    {
        $events = [];
        foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
            $line = trim($line);
            if ($line === '' || !str_contains($line, "\t")) {
                continue;
            }

            $columns = array_map('trim', explode("\t", $line));
            if (count($columns) < 2 || !preg_match('/^\w[\w.-]*$/', $columns[0])) {
                continue;
            }

            $punchAt = $this->parseTime($columns[1]);
            if (!$punchAt) {
                continue;
            }

            $events[] = [
                'device_user_id' => $columns[0],
                'punch_time' => $punchAt,
                'direction' => $this->normalizeDirection($columns[2] ?? null),
                'verify_mode' => isset($columns[3]) && is_numeric($columns[3]) ? (int) $columns[3] : null,
            ];
        }

        return $events;
    }

    private function fromKeyValue(string $text): array
    {
        $events = [];
        foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
            $line = trim($line);
            if ($line === '' || !str_contains($line, '=')) {
                continue;
            }

            $pairs = [];
            if (str_contains($line, '&')) {
                parse_str($line, $pairs);
            } else {
                foreach (preg_split('/[\t;,]+|\s{2,}/', $line) as $part) {
                    [$key, $value] = array_pad(explode('=', $part, 2), 2, null);
                    if ($key !== null && $value !== null) {
                        $pairs[trim($key)] = trim($value);
                    }
                }
            }

            $event = $pairs ? $this->fromAssoc($pairs) : null;
            if ($event) {
                $events[] = $event;
            }
        }

        return $events;
    }

    private function fromLooseText(string $text): array
    {
        $events = [];
        foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
            $line = trim($line);
            if (!preg_match(self::DATETIME_PATTERN, $line, $match, PREG_OFFSET_CAPTURE)) {
                continue;
            }

            $punchAt = $this->parseTime($match[0][0]);
            if (!$punchAt) {
                continue;
            }

            $before = trim(substr($line, 0, $match[0][1]), " \t,;|");
            $after = trim(substr($line, $match[0][1] + strlen($match[0][0])), " \t,;|");
            $tokens = array_values(array_filter(preg_split('/[\s,;|]+/', $before) ?: [], 'strlen'));
            $userId = $tokens ? end($tokens) : null;
            if ($userId === null || !preg_match('/^\w[\w.-]*$/', $userId)) {
                continue;
            }

            $afterTokens = array_values(array_filter(preg_split('/[\s,;|]+/', $after) ?: [], 'strlen'));
            $events[] = [
                'device_user_id' => $userId,
                'punch_time' => $punchAt,
                'direction' => $this->normalizeDirection($afterTokens[0] ?? null),
                'verify_mode' => isset($afterTokens[1]) && is_numeric($afterTokens[1]) ? (int) $afterTokens[1] : null,
            ];
        }

        return $events;
    }

    public function parseTime(string $value): ?Carbon
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        try {
            if (ctype_digit($value)) {
                $seconds = strlen($value) >= 13 ? intdiv((int) $value, 1000) : (int) $value;
                if ($seconds < 946684800) { // before 2000-01-01: not a real epoch
                    return null;
                }
                // Keep the device's local wall-clock time, like every other punch source.
                return Carbon::createFromTimestamp($seconds, $this->deviceTimezone)->shiftTimezone(config('app.timezone'));
            }

            if (!preg_match(self::DATETIME_PATTERN, $value, $m)) {
                return null;
            }

            // Device clocks are local wall time; keep the wall time as-is.
            $punchAt = Carbon::create((int) $m[1], (int) $m[2], (int) $m[3], (int) $m[4], (int) $m[5], (int) ($m[6] ?? 0));
            if (!$punchAt || $punchAt->year < 2000 || $punchAt->greaterThan(now($this->deviceTimezone)->shiftTimezone(config('app.timezone'))->addDay())) {
                return null;
            }

            return $punchAt;
        } catch (\Throwable) {
            return null;
        }
    }

    private function normalizeDirection(?string $value): string
    {
        $value = strtolower(trim((string) $value));
        return match (true) {
            // Numeric state codes are device-specific (and many terminals send 0 for every punch),
            // so only explicit words force a direction; everything else uses first-IN / last-OUT.
            in_array($value, ['in', 'checkin', 'check_in', 'clock_in', 'clockin', 'clock in', 'check in'], true) => 'in',
            in_array($value, ['out', 'checkout', 'check_out', 'clock_out', 'clockout', 'clock out', 'check out'], true) => 'out',
            default => 'auto',
        };
    }

    private function firstValue(array $row, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (isset($row[$key]) && $row[$key] !== '') {
                return $row[$key];
            }
        }

        return null;
    }

    private function stripBom(string $payload): string
    {
        return str_starts_with($payload, "\xEF\xBB\xBF") ? substr($payload, 3) : $payload;
    }
}
