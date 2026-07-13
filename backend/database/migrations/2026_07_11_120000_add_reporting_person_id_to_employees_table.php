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
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'reporting_person_id')) {
                $table->unsignedBigInteger('reporting_person_id')->nullable()->after('designation_id');
                $table->foreign('reporting_person_id')
                    ->references('id')
                    ->on('employees')
                    ->nullOnDelete();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'reporting_person_id')) {
                $table->dropForeign(['reporting_person_id']);
                $table->dropColumn('reporting_person_id');
            }
        });
    }
};
