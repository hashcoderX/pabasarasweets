<?php

namespace App\Services\Attendance;

use App\Models\AttendanceDeviceSetting;
use App\Models\BiometricDevicePacket;

/**
 * Parses a raw device payload, marks attendance for every punch in it and records the packet.
 */
class BiometricPacketIngestor
{
    private const MAX_STORED_BYTES = 2048;
    private const KEEP_PACKETS = 2000;

    public function __construct(private BiometricPunchProcessor $processor)
    {
    }

    /**
     * @return array{status:string, events:int, results:array<string,int>, message:string, packet_id:int}
     */
    public function ingest(string $payload, string $protocol, ?string $sourceIp, ?AttendanceDeviceSetting $settings = null, string $source = 'realtime_push'): array
    {
        $settings ??= AttendanceDeviceSetting::query()->latest('id')->first();
        $parser = new BiometricPacketParser($settings?->device_timezone ?: 'Asia/Colombo');

        $events = [];
        $error = null;
        try {
            $events = $parser->parse($payload);
        } catch (\Throwable $e) {
            $error = $e->getMessage();
        }

        $results = [];
        foreach ($events as $event) {
            try {
                $outcome = $this->processor->process($event + [
                    'source_ip' => $sourceIp,
                    'source' => $source,
                    'raw_hex' => substr(bin2hex($payload), 0, 128),
                ]);
                $results[$outcome['result']] = ($results[$outcome['result']] ?? 0) + 1;
            } catch (\Throwable $e) {
                $results['error'] = ($results['error'] ?? 0) + 1;
                $error = $e->getMessage();
            }
        }

        $status = match (true) {
            $events === [] && $error !== null => 'error',
            $events === [] => 'unparsed',
            isset($results['error']) => 'error',
            default => 'parsed',
        };

        $message = $events === []
            ? ($error ?? ($parser->isMostlyText($payload) ? 'No punch found in text payload.' : 'Binary payload - format not recognised yet.'))
            : collect($results)->map(fn ($count, $result) => "{$result}: {$count}")->implode(', ') . ($error ? " ({$error})" : '');

        $packet = $this->recordPacket($payload, $protocol, $sourceIp, $status, count($events), $message);

        return [
            'status' => $status,
            'events' => count($events),
            'results' => $results,
            'message' => $message,
            'packet_id' => $packet->id,
        ];
    }

    public function recordPacket(string $payload, string $protocol, ?string $sourceIp, string $status, int $events, string $message): BiometricDevicePacket
    {
        $stored = substr($payload, 0, self::MAX_STORED_BYTES);
        $packet = BiometricDevicePacket::create([
            'source_ip' => $sourceIp,
            'protocol' => $protocol,
            'bytes' => strlen($payload),
            'payload_hex' => bin2hex($stored),
            'payload_text' => mb_convert_encoding(preg_replace('/[^\x20-\x7E\t\r\n]/', '.', $stored), 'UTF-8', 'UTF-8'),
            'status' => $status,
            'events_count' => $events,
            'message' => mb_substr($message, 0, 255),
        ]);

        if ($packet->id % 200 === 0) {
            BiometricDevicePacket::query()->where('id', '<=', $packet->id - self::KEEP_PACKETS)->delete();
        }

        return $packet;
    }
}
