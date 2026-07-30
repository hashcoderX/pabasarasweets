<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('dashboard_widget_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('widget_key', 120);
            $table->boolean('is_visible')->default(true);
            $table->timestamp('hidden_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'widget_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_widget_permissions');
    }
};
