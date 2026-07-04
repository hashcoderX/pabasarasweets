<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outlet_sales', function (Blueprint $table) {
            if (!Schema::hasColumn('outlet_sales', 'status')) {
                $table->string('status', 30)
                    ->default('ordered')
                    ->after('sale_number');
            }

            if (!Schema::hasColumn('outlet_sales', 'do_number')) {
                $table->string('do_number', 60)
                    ->nullable()
                    ->after('sale_number');
            }

            if (!Schema::hasColumn('outlet_sales', 'delivery_employee_id')) {
                $table->foreignId('delivery_employee_id')
                    ->nullable()
                    ->after('loyalty_customer_id')
                    ->constrained('employees')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('outlet_sales', 'delivery_employee_name')) {
                $table->string('delivery_employee_name', 255)
                    ->nullable()
                    ->after('delivery_employee_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('outlet_sales', function (Blueprint $table) {
            if (Schema::hasColumn('outlet_sales', 'delivery_employee_name')) {
                $table->dropColumn('delivery_employee_name');
            }

            if (Schema::hasColumn('outlet_sales', 'delivery_employee_id')) {
                $table->dropConstrainedForeignId('delivery_employee_id');
            }

            if (Schema::hasColumn('outlet_sales', 'do_number')) {
                $table->dropColumn('do_number');
            }

            if (Schema::hasColumn('outlet_sales', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
