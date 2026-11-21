<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('distribution_invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('distribution_invoices', 'is_dispatch_order')) {
                $table->boolean('is_dispatch_order')->default(false)->after('status');
            }

            if (!Schema::hasColumn('distribution_invoices', 'dispatch_order_number')) {
                $table->string('dispatch_order_number', 60)->nullable()->after('is_dispatch_order');
                $table->index('dispatch_order_number', 'distribution_invoices_dispatch_order_number_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('distribution_invoices', function (Blueprint $table) {
            if (Schema::hasColumn('distribution_invoices', 'dispatch_order_number')) {
                $table->dropIndex('distribution_invoices_dispatch_order_number_idx');
                $table->dropColumn('dispatch_order_number');
            }

            if (Schema::hasColumn('distribution_invoices', 'is_dispatch_order')) {
                $table->dropColumn('is_dispatch_order');
            }
        });
    }
};
