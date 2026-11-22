<?php

namespace App\Console\Commands;

use App\Models\AttendanceDeviceSetting;
use App\Services\Attendance\BiometricPacketIngestor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Long-running receiver for fingerprint terminal real-time pushes.
 *
 * Listens on one port for UDP datagrams, raw TCP frames and HTTP requests (including ADMS/iClock
 * "/iclock/cdata" pushes). Every punch it can read is marked as IN/OUT immediately.
 *
 * Point the device's "Server" setting at this PC's LAN IP and the listener port.
 */
class AttendanceListen extends Command
{
    protected $signature = 'attendance:listen
        {--port= : Port to listen on (defaults to the saved listener port, then 5055)}
        {--host=0.0.0.0 : Interface to bind}';

    protected $description = 'Receive fingerprint device punches (UDP / TCP / HTTP) and mark attendance IN/OUT';

    private const HEARTBEAT_SECONDS = 15;
    private const RAW_TCP_IDLE_FLUSH = 0.5;
    private const CLIENT_IDLE_TIMEOUT = 120;
    private const MAX_BUFFER = 1048576;

    private ?AttendanceDeviceSetting $settings = null;

    /** @var array<int, array{stream:resource, buffer:string, last:float, peer:string}> */
    private array $clients = [];

    public function handle(BiometricPacketIngestor $ingestor): int
    {
        $this->loadSettings();
        $port = (int) ($this->option('port') ?: ($this->settings?->listener_port ?: 5055));
        $host = (string) $this->option('host');

        $udp = @stream_socket_server("udp://{$host}:{$port}", $errno, $errstr, STREAM_SERVER_BIND);
        if (!$udp) {
            $this->error("Cannot open UDP {$host}:{$port} - {$errstr}. Is another listener already running?");
            return self::FAILURE;
        }

        $tcp = @stream_socket_server("tcp://{$host}:{$port}", $errno, $errstr);
        if (!$tcp) {
            $this->error("Cannot open TCP {$host}:{$port} - {$errstr}. Is another listener already running?");
            return self::FAILURE;
        }
        stream_set_blocking($tcp, false);

        $ips = implode(', ', self::localIps()) ?: 'unknown';
        $this->info("Attendance listener running on UDP+TCP port {$port}.");
        $this->line("Set the device Server IP to one of: {$ips}  and Server Port to {$port}.");
        $this->line('Press Ctrl+C to stop.');

        $this->heartbeat(true, $port);
        $lastHeartbeat = microtime(true);

        while (true) {
            $read = [$udp, $tcp];
            foreach ($this->clients as $client) {
                $read[] = $client['stream'];
            }
            $write = $except = null;

            $ready = @stream_select($read, $write, $except, 1, 0);

            if ($ready) {
                foreach ($read as $stream) {
                    if ($stream === $udp) {
                        $this->receiveUdp($udp, $ingestor);
                    } elseif ($stream === $tcp) {
                        $this->acceptTcp($tcp);
                    } else {
                        $this->readClient($stream, $ingestor);
                    }
                }
            }

            $this->flushIdleClients($ingestor);

            if (microtime(true) - $lastHeartbeat >= self::HEARTBEAT_SECONDS) {
                $this->heartbeat(false, $port);
                $lastHeartbeat = microtime(true);
            }
        }
    }

    private function receiveUdp($udp, BiometricPacketIngestor $ingestor): void
    {
        $data = stream_socket_recvfrom($udp, 65535, 0, $peer);
        if ($data === false || $data === '') {
            return;
        }

        $this->handlePayload($data, 'udp', self::peerIp($peer), $ingestor);
    }

    private function acceptTcp($tcp): void
    {
        $client = @stream_socket_accept($tcp, 0, $peer);
        if (!$client) {
            return;
        }

        stream_set_blocking($client, false);
        $this->clients[(int) $client] = [
            'stream' => $client,
            'buffer' => '',
            'last' => microtime(true),
            'peer' => (string) $peer,
        ];
        $this->line('<comment>[' . $this->clock() . "]</comment> TCP connection from {$peer}");
    }

    private function readClient($stream, BiometricPacketIngestor $ingestor): void
    {
        $id = (int) $stream;
        if (!isset($this->clients[$id])) {
            return;
        }

        $chunk = @fread($stream, 65535);
        if ($chunk === false || ($chunk === '' && feof($stream))) {
            $this->flushClient($id, $ingestor);
            $this->closeClient($id);
            return;
        }

        $this->clients[$id]['buffer'] .= $chunk;
        $this->clients[$id]['last'] = microtime(true);

        if (strlen($this->clients[$id]['buffer']) > self::MAX_BUFFER) {
            $this->flushClient($id, $ingestor);
            return;
        }

        if ($this->looksLikeHttp($this->clients[$id]['buffer'])) {
            $this->tryHandleHttp($id, $ingestor);
        }
    }

    private function flushIdleClients(BiometricPacketIngestor $ingestor): void
    {
        $now = microtime(true);
        foreach (array_keys($this->clients) as $id) {
            $client = $this->clients[$id];
            $idle = $now - $client['last'];

            if ($client['buffer'] !== '' && !$this->looksLikeHttp($client['buffer']) && $idle >= self::RAW_TCP_IDLE_FLUSH) {
                $this->flushClient($id, $ingestor);
            }

            if ($idle >= self::CLIENT_IDLE_TIMEOUT) {
                $this->closeClient($id);
            }
        }
    }

    private function flushClient(int $id, BiometricPacketIngestor $ingestor): void
    {
        if (!isset($this->clients[$id]) || $this->clients[$id]['buffer'] === '') {
            return;
        }

        $buffer = $this->clients[$id]['buffer'];
        $this->clients[$id]['buffer'] = '';
        $this->handlePayload($buffer, 'tcp', self::peerIp($this->clients[$id]['peer']), $ingestor);
    }

    private function closeClient(int $id): void
    {
        if (isset($this->clients[$id])) {
            @fclose($this->clients[$id]['stream']);
            unset($this->clients[$id]);
        }
    }

    private function looksLikeHttp(string $buffer): bool
    {
        return (bool) preg_match('/^(GET|POST|PUT|HEAD|OPTIONS) \S+ HTTP\/1\.[01]/', $buffer);
    }

    private function tryHandleHttp(int $id, BiometricPacketIngestor $ingestor): void
    {
        $buffer = $this->clients[$id]['buffer'];
        $headerEnd = strpos($buffer, "\r\n\r\n");
        if ($headerEnd === false) {
            return;
        }

        $head = substr($buffer, 0, $headerEnd);
        $lines = explode("\r\n", $head);
        [$method, $target] = array_pad(explode(' ', $lines[0]), 2, '/');

        $headers = [];
        foreach (array_slice($lines, 1) as $line) {
            [$name, $value] = array_pad(explode(':', $line, 2), 2, '');
            $headers[strtolower(trim($name))] = trim($value);
        }

        $length = (int) ($headers['content-length'] ?? 0);
        $body = substr($buffer, $headerEnd + 4);
        if (strlen($body) < $length) {
            return; // wait for the rest of the body
        }

        $body = substr($body, 0, $length);
        $this->clients[$id]['buffer'] = (string) substr($buffer, $headerEnd + 4 + $length);

        $path = strtolower((string) parse_url($target, PHP_URL_PATH));
        parse_str((string) parse_url($target, PHP_URL_QUERY), $query);
        $query = array_change_key_case($query, CASE_LOWER);
        $ip = self::peerIp($this->clients[$id]['peer']);

        $response = $this->handleHttpRequest(strtoupper($method), $path, $query, $body, $ip, $ingestor, $headers);
        $this->sendHttp($id, $response['body'], $response['type']);

        if (strtolower($headers['connection'] ?? '') === 'close') {
            $this->closeClient($id);
        }
    }

    /**
     * @return array{body:string, type:string}
     */
    private function handleHttpRequest(string $method, string $path, array $query, string $body, ?string $ip, BiometricPacketIngestor $ingestor, array $headers): array
    {
        $text = ['type' => 'text/plain'];

        // ADMS / iClock protocol.
        if (str_starts_with($path, '/iclock/')) {
            if (!$this->isAllowed($ip, "HTTP {$method} {$path}")) {
                return $text + ['body' => 'OK'];
            }

            $serial = (string) ($query['sn'] ?? '');

            if ($path === '/iclock/cdata' && $method === 'GET') {
                $this->line('<comment>[' . $this->clock() . "]</comment> Device handshake from {$ip} (SN {$serial})");
                return $text + ['body' => implode("\r\n", [
                    "GET OPTION FROM: {$serial}",
                    'ATTLOGStamp=None',
                    'OPERLOGStamp=9999',
                    'ATTPHOTOStamp=None',
                    'ErrorDelay=30',
                    'Delay=10',
                    'TransTimes=00:00;14:05',
                    'TransInterval=1',
                    'TransFlag=TransData AttLog',
                    'TimeZone=' . $this->timezoneOffsetHours(),
                    'Realtime=1',
                    'Encrypt=None',
                ])];
            }

            if ($path === '/iclock/cdata' && $method === 'POST') {
                $table = strtoupper((string) ($query['table'] ?? ''));
                if ($table === 'ATTLOG') {
                    $result = $this->ingest($body, 'http', $ip, $ingestor);
                    return $text + ['body' => 'OK: ' . ($result['events'] ?? 0)];
                }

                $ingestor->recordPacket($body, 'http', $ip, 'ignored', 0, "iClock table {$table} (not attendance)");
                return $text + ['body' => 'OK'];
            }

            // getrequest / devicecmd / ping / anything else: acknowledge.
            return $text + ['body' => 'OK'];
        }

        if (!$this->isAllowed($ip, "HTTP {$method} {$path}")) {
            return $text + ['body' => 'OK'];
        }

        $payload = $body !== '' ? $body : http_build_query($query);
        if ($payload === '') {
            return $text + ['body' => 'OK'];
        }

        $result = $this->ingest($payload, 'http', $ip, $ingestor);
        $wantsJson = str_contains(strtolower($headers['content-type'] ?? ''), 'json') || str_starts_with(ltrim($body), '{') || str_starts_with(ltrim($body), '[');

        return $wantsJson
            ? ['type' => 'application/json', 'body' => json_encode(['result' => true, 'code' => 0, 'status' => 1, 'message' => 'OK', 'count' => $result['events'] ?? 0])]
            : $text + ['body' => 'OK'];
    }

    private function sendHttp(int $id, string $body, string $type): void
    {
        if (!isset($this->clients[$id])) {
            return;
        }

        $response = "HTTP/1.1 200 OK\r\n"
            . "Content-Type: {$type}\r\n"
            . 'Content-Length: ' . strlen($body) . "\r\n"
            . 'Date: ' . gmdate('D, d M Y H:i:s') . " GMT\r\n"
            . "Connection: keep-alive\r\n\r\n"
            . $body;

        @fwrite($this->clients[$id]['stream'], $response);
    }

    private function handlePayload(string $payload, string $protocol, ?string $ip, BiometricPacketIngestor $ingestor): void
    {
        if (!$this->isAllowed($ip, strtoupper($protocol) . ' ' . strlen($payload) . ' bytes', $payload, $protocol, $ingestor)) {
            return;
        }

        $this->ingest($payload, $protocol, $ip, $ingestor);
    }

    private function ingest(string $payload, string $protocol, ?string $ip, BiometricPacketIngestor $ingestor): array
    {
        try {
            $result = $ingestor->ingest($payload, $protocol, $ip, $this->settings);
        } catch (\Throwable $e) {
            // Usually a dropped MySQL connection after a long idle period: reconnect and retry once.
            Log::warning('Attendance listener ingest failed, retrying', ['error' => $e->getMessage()]);
            try {
                DB::reconnect();
                $result = $ingestor->ingest($payload, $protocol, $ip, $this->settings);
            } catch (\Throwable $retryError) {
                Log::error('Attendance listener ingest failed', ['error' => $retryError->getMessage()]);
                $this->error('[' . $this->clock() . "] Failed to store packet from {$ip}: {$retryError->getMessage()}");
                return [];
            }
        }

        $this->markPacketSeen();
        $tag = $result['status'] === 'parsed' ? 'info' : 'comment';
        $this->line("<{$tag}>[" . $this->clock() . "] " . strtoupper($protocol) . " {$ip} " . strlen($payload)
            . " bytes - {$result['status']}</{$tag}> {$result['message']}");

        return $result;
    }

    private function isAllowed(?string $ip, string $label, ?string $payload = null, ?string $protocol = null, ?BiometricPacketIngestor $ingestor = null): bool
    {
        $settings = $this->settings;
        $reason = null;

        if ($settings && !$settings->is_active) {
            $reason = 'Integration is disabled in device settings.';
        } elseif ($settings && !$settings->listener_allow_any_ip && $settings->device_ip && $ip !== $settings->device_ip) {
            $reason = "Source {$ip} is not the configured device IP {$settings->device_ip}.";
        }

        if ($reason === null) {
            return true;
        }

        $this->line('<comment>[' . $this->clock() . "] Rejected {$label} from {$ip}:</comment> {$reason}");
        if ($payload !== null && $ingestor) {
            try {
                $ingestor->recordPacket($payload, $protocol ?? 'tcp', $ip, 'rejected', 0, $reason);
            } catch (\Throwable) {
                // Recording a rejected packet is best effort.
            }
        }

        return false;
    }

    private function loadSettings(): void
    {
        try {
            $this->settings = AttendanceDeviceSetting::query()->latest('id')->first();
        } catch (\Throwable $e) {
            Log::warning('Attendance listener could not load settings', ['error' => $e->getMessage()]);
            try {
                DB::reconnect();
            } catch (\Throwable) {
            }
        }
    }

    private function heartbeat(bool $starting, int $port): void
    {
        $this->loadSettings();
        if (!$this->settings) {
            return;
        }

        $values = ['listener_heartbeat_at' => now()];
        if ($starting) {
            $values['listener_started_at'] = now();
            $values['listener_port'] = $port;
        }

        try {
            AttendanceDeviceSetting::query()->whereKey($this->settings->id)->update($values);
        } catch (\Throwable $e) {
            Log::warning('Attendance listener heartbeat failed', ['error' => $e->getMessage()]);
        }
    }

    private function markPacketSeen(): void
    {
        if (!$this->settings) {
            return;
        }

        try {
            AttendanceDeviceSetting::query()->whereKey($this->settings->id)->update(['listener_last_packet_at' => now()]);
        } catch (\Throwable) {
        }
    }

    private function clock(): string
    {
        return now($this->settings?->device_timezone ?: "Asia/Colombo")->format("H:i:s");
    }

    private function timezoneOffsetHours(): string
    {
        $tz = $this->settings?->device_timezone ?: 'Asia/Colombo';
        try {
            $offset = (new \DateTimeZone($tz))->getOffset(new \DateTime('now')) / 3600;
            return rtrim(rtrim(number_format($offset, 1, '.', ''), '0'), '.');
        } catch (\Throwable) {
            return '5.5';
        }
    }

    private static function peerIp(?string $peer): ?string
    {
        if (!$peer) {
            return null;
        }

        // "ip:port" or "[ipv6]:port"
        if (preg_match('/^\[?([^\]]+?)\]?:\d+$/', $peer, $m)) {
            return $m[1];
        }

        return $peer;
    }

    /**
     * @return list<string>
     */
    public static function localIps(): array
    {
        $ips = @gethostbynamel(gethostname()) ?: [];
        return array_values(array_filter($ips, fn ($ip) => !str_starts_with($ip, '127.')));
    }
}
