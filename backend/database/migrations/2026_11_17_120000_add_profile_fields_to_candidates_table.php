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
        Schema::table('candidates', function (Blueprint $table) {
            if (!Schema::hasColumn('candidates', 'city')) {
                $table->string('city', 120)->nullable()->after('address');
            }
            if (!Schema::hasColumn('candidates', 'source')) {
                $table->string('source', 100)->nullable()->after('position_applied');
            }
            if (!Schema::hasColumn('candidates', 'linkedin_url')) {
                $table->string('linkedin_url')->nullable()->after('source');
            }
            if (!Schema::hasColumn('candidates', 'portfolio_url')) {
                $table->string('portfolio_url')->nullable()->after('linkedin_url');
            }
            if (!Schema::hasColumn('candidates', 'years_of_experience')) {
                $table->decimal('years_of_experience', 4, 1)->nullable()->after('portfolio_url');
            }
            if (!Schema::hasColumn('candidates', 'current_company')) {
                $table->string('current_company')->nullable()->after('years_of_experience');
            }
            if (!Schema::hasColumn('candidates', 'current_designation')) {
                $table->string('current_designation')->nullable()->after('current_company');
            }
            if (!Schema::hasColumn('candidates', 'current_salary')) {
                $table->decimal('current_salary', 12, 2)->nullable()->after('current_designation');
            }
            if (!Schema::hasColumn('candidates', 'notice_period_days')) {
                $table->unsignedInteger('notice_period_days')->nullable()->after('current_salary');
            }
            if (!Schema::hasColumn('candidates', 'skills')) {
                $table->text('skills')->nullable()->after('notice_period_days');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $columns = [
                'city',
                'source',
                'linkedin_url',
                'portfolio_url',
                'years_of_experience',
                'current_company',
                'current_designation',
                'current_salary',
                'notice_period_days',
                'skills',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('candidates', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
