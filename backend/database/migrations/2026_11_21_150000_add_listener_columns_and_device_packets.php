<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Idempotent: skips columns/tables that already exist (e.g. a database restored
     * after this migration had already run but without its migrations-table record).
     */
    public function up(): void
    {
        $columns = [
            'listener_port' => fn (Blueprint $table) => $table->unsignedInteger('listener_port')->default(5055)->after('p2p_service_enabled'),
            'listener_allow_any_ip' => fn (Blueprint $table) => $table->boolean('listener_allow_any_ip')->default(false)->after('listener_port'),
            'device_timezone' => fn (Blueprint $table) => $table->string('device_timezone', 64)->default('Asia/Colombo')->after('listener_allow_any_ip'),
            'listener_started_at' => fn (Blueprint $table) => $table->timestamp('listener_started_at')->nullable()->after('device_timezone'),
            'listener_heartbeat_at' => fn (Blueprint $table) => $table->timestamp('listener_heartbeat_at')->nullable()->after('listener_started_at'),
            'listener_last_packet_at' => fn (Blueprint $table) => $table->timestamp('listener_last_packet_at')->nullable()->after('listener_heartbeat_at'),
        ];

        foreach ($columns as $name => $define) {
            if (!Schema::hasColumn('attendance_device_settings', $name)) {
                Schema::table('attendance_device_settings', $define);
            }
        }

        if (!Schema::hasTable('biometric_device_packets')) {
            Schema::create('biometric_device_packets', function (Blueprint $table) {
                $table->id();
                $table->string('source_ip', 45)->nullable();
                $table->string('protocol', 8);
                $table->unsignedInteger('bytes')->default(0);
                $table->text('payload_hex')->nullable();
                $table->text('payload_text')->nullable();
                $table->string('status', 16);
                $table->unsignedInteger('events_count')->default(0);
                $table->string('message', 255)->nullable();
                $table->timestamps();

                $table->index('created_at');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_device_packets');

        $existing = array_values(array_filter([
            'listener_port',
            'listener_allow_any_ip',
            'device_timezone',
            'listener_started_at',
            'listener_heartbeat_at',
            'listener_last_packet_at',
        ], fn ($column) => Schema::hasColumn('attendance_device_settings', $column)));

        if ($existing) {
            Schema::table('attendance_device_settings', function (Blueprint $table) use ($existing) {
                $table->dropColumn($existing);
            });
        }
    }
};
