<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('distribution_invoices')) {
            return;
        }

        Schema::table('distribution_invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('distribution_invoices', 'ref_latitude')) {
                $table->decimal('ref_latitude', 10, 7)->nullable()->after('notes');
            }
            if (!Schema::hasColumn('distribution_invoices', 'ref_longitude')) {
                $table->decimal('ref_longitude', 10, 7)->nullable()->after('ref_latitude');
            }
            if (!Schema::hasColumn('distribution_invoices', 'ref_gps_accuracy')) {
                $table->decimal('ref_gps_accuracy', 8, 2)->nullable()->after('ref_longitude');
            }
            if (!Schema::hasColumn('distribution_invoices', 'ref_gps_captured_at')) {
                $table->timestamp('ref_gps_captured_at')->nullable()->after('ref_gps_accuracy');
            }

            if (!Schema::hasColumn('distribution_invoices', 'billing_latitude')) {
                $table->decimal('billing_latitude', 10, 7)->nullable()->after('ref_gps_captured_at');
            }
            if (!Schema::hasColumn('distribution_invoices', 'billing_longitude')) {
                $table->decimal('billing_longitude', 10, 7)->nullable()->after('billing_latitude');
            }
            if (!Schema::hasColumn('distribution_invoices', 'billing_gps_accuracy')) {
                $table->decimal('billing_gps_accuracy', 8, 2)->nullable()->after('billing_longitude');
            }
            if (!Schema::hasColumn('distribution_invoices', 'billing_gps_captured_at')) {
                $table->timestamp('billing_gps_captured_at')->nullable()->after('billing_gps_accuracy');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('distribution_invoices')) {
            return;
        }

        Schema::table('distribution_invoices', function (Blueprint $table) {
            if (Schema::hasColumn('distribution_invoices', 'billing_gps_captured_at')) {
                $table->dropColumn('billing_gps_captured_at');
            }
            if (Schema::hasColumn('distribution_invoices', 'billing_gps_accuracy')) {
                $table->dropColumn('billing_gps_accuracy');
            }
            if (Schema::hasColumn('distribution_invoices', 'billing_longitude')) {
                $table->dropColumn('billing_longitude');
            }
            if (Schema::hasColumn('distribution_invoices', 'billing_latitude')) {
                $table->dropColumn('billing_latitude');
            }

            if (Schema::hasColumn('distribution_invoices', 'ref_gps_captured_at')) {
                $table->dropColumn('ref_gps_captured_at');
            }
            if (Schema::hasColumn('distribution_invoices', 'ref_gps_accuracy')) {
                $table->dropColumn('ref_gps_accuracy');
            }
            if (Schema::hasColumn('distribution_invoices', 'ref_longitude')) {
                $table->dropColumn('ref_longitude');
            }
            if (Schema::hasColumn('distribution_invoices', 'ref_latitude')) {
                $table->dropColumn('ref_latitude');
            }
        });
    }
};
