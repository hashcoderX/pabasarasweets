<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biometric_punch_logs', function (Blueprint $table) {
            $table->id();
            $table->string('device_user_id', 64);
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->dateTime('punch_time');
            $table->string('direction', 8)->default('auto');
            $table->unsignedTinyInteger('verify_mode')->nullable();
            $table->string('device_mac', 32)->nullable();
            $table->string('source_ip', 45)->nullable();
            $table->string('source', 32)->default('realtime_push');
            $table->string('raw_hex', 128)->nullable();
            $table->string('result', 32);
            $table->string('message', 255)->nullable();
            $table->timestamps();

            $table->unique(['device_user_id', 'punch_time']);
            $table->index('punch_time');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_punch_logs');
    }
};
