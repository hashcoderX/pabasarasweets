<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE employees DROP FOREIGN KEY employees_department_id_foreign');
        DB::statement('ALTER TABLE employees MODIFY department_id BIGINT UNSIGNED NULL');
        DB::statement(
            'ALTER TABLE employees ADD CONSTRAINT employees_department_id_foreign FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL'
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE employees DROP FOREIGN KEY employees_department_id_foreign');
        DB::statement('ALTER TABLE employees MODIFY department_id BIGINT UNSIGNED NOT NULL');
        DB::statement(
            'ALTER TABLE employees ADD CONSTRAINT employees_department_id_foreign FOREIGN KEY (department_id) REFERENCES departments(id)'
        );
    }
};
