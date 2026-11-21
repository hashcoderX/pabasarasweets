<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('distribution_dos')) {
            return;
        }

        Schema::table('distribution_dos', function (Blueprint $table) {
            if (!Schema::hasColumn('distribution_dos', 'delivery_date')) {
                $table->date('delivery_date')->nullable()->after('do_date');
            }
            if (!Schema::hasColumn('distribution_dos', 'call_confirmed')) {
                $table->boolean('call_confirmed')->default(false)->after('delivery_date');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('distribution_dos')) {
            return;
        }

        Schema::table('distribution_dos', function (Blueprint $table) {
            if (Schema::hasColumn('distribution_dos', 'call_confirmed')) {
                $table->dropColumn('call_confirmed');
            }
            if (Schema::hasColumn('distribution_dos', 'delivery_date')) {
                $table->dropColumn('delivery_date');
            }
        });
    }
};
