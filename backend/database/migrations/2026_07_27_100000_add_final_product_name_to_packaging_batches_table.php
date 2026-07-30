<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('packaging_batches')) {
            return;
        }

        Schema::table('packaging_batches', function (Blueprint $table) {
            if (!Schema::hasColumn('packaging_batches', 'final_product_name')) {
                $table->string('final_product_name', 180)->nullable()->after('batch_no');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('packaging_batches')) {
            return;
        }

        Schema::table('packaging_batches', function (Blueprint $table) {
            if (Schema::hasColumn('packaging_batches', 'final_product_name')) {
                $table->dropColumn('final_product_name');
            }
        });
    }
};
