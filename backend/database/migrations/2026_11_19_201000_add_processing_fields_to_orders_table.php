<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('orders')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'customer_id')) {
                $table->foreignId('customer_id')
                    ->nullable()
                    ->after('outlet_id')
                    ->constrained('distribution_customers')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('orders', 'load_id')) {
                $table->foreignId('load_id')
                    ->nullable()
                    ->after('customer_id')
                    ->constrained('loads')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('orders', 'do_number')) {
                $table->string('do_number', 60)->nullable()->after('status');
            }

            if (!Schema::hasColumn('orders', 'invoice_number')) {
                $table->string('invoice_number', 60)->nullable()->after('do_number');
            }

            if (!Schema::hasColumn('orders', 'accepted_at')) {
                $table->timestamp('accepted_at')->nullable()->after('invoice_number');
            }

            if (!Schema::hasColumn('orders', 'rejected_at')) {
                $table->timestamp('rejected_at')->nullable()->after('accepted_at');
            }

            if (!Schema::hasColumn('orders', 'rejected_reason')) {
                $table->text('rejected_reason')->nullable()->after('rejected_at');
            }

            if (!Schema::hasColumn('orders', 'processed_by')) {
                $table->foreignId('processed_by')
                    ->nullable()
                    ->after('rejected_reason')
                    ->constrained('users')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('orders', 'do_created_at')) {
                $table->timestamp('do_created_at')->nullable()->after('processed_by');
            }

            if (!Schema::hasColumn('orders', 'invoice_created_at')) {
                $table->timestamp('invoice_created_at')->nullable()->after('do_created_at');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('orders')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'invoice_created_at')) {
                $table->dropColumn('invoice_created_at');
            }
            if (Schema::hasColumn('orders', 'do_created_at')) {
                $table->dropColumn('do_created_at');
            }
            if (Schema::hasColumn('orders', 'processed_by')) {
                $table->dropConstrainedForeignId('processed_by');
            }
            if (Schema::hasColumn('orders', 'rejected_reason')) {
                $table->dropColumn('rejected_reason');
            }
            if (Schema::hasColumn('orders', 'rejected_at')) {
                $table->dropColumn('rejected_at');
            }
            if (Schema::hasColumn('orders', 'accepted_at')) {
                $table->dropColumn('accepted_at');
            }
            if (Schema::hasColumn('orders', 'invoice_number')) {
                $table->dropColumn('invoice_number');
            }
            if (Schema::hasColumn('orders', 'do_number')) {
                $table->dropColumn('do_number');
            }
            if (Schema::hasColumn('orders', 'load_id')) {
                $table->dropConstrainedForeignId('load_id');
            }
            if (Schema::hasColumn('orders', 'customer_id')) {
                $table->dropConstrainedForeignId('customer_id');
            }
        });
    }
};
