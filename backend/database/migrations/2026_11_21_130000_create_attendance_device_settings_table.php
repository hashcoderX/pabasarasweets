<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('attendance_device_settings', function (Blueprint $table) {
            $table->id();
            $table->string('device_name')->default('Realand Device');
            $table->string('communication_type', 32)->default('CS');
            $table->string('communication_password', 64)->nullable();
            $table->boolean('dhcp_enabled')->default(true);
            $table->string('device_ip', 45)->nullable();
            $table->unsignedInteger('device_port')->default(5500);
            $table->string('subnet_mask', 45)->nullable();
            $table->string('gateway', 45)->nullable();
            $table->string('dns', 45)->nullable();
            $table->boolean('real_time_push_enabled')->default(false);
            $table->string('server_host')->nullable();
            $table->unsignedInteger('server_port')->nullable();
            $table->boolean('p2p_service_enabled')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_tested_at')->nullable();
            $table->string('last_test_result', 255)->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->json('last_sync_summary')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendance_device_settings');
    }
};

