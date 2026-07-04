<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('outlet_sales') || !Schema::hasTable('loads') || Schema::hasColumn('outlet_sales', 'load_id')) {
            return;
        }

        Schema::table('outlet_sales', function (Blueprint $table) {
            $table->foreignId('load_id')
                ->nullable()
                ->constrained('loads')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('outlet_sales') || !Schema::hasColumn('outlet_sales', 'load_id')) {
            return;
        }

        Schema::table('outlet_sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('load_id');
        });
    }
};
