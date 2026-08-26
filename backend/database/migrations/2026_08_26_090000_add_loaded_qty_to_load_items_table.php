<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('load_items') || Schema::hasColumn('load_items', 'loaded_qty')) {
            return;
        }

        Schema::table('load_items', function (Blueprint $table) {
            $table->decimal('loaded_qty', 10, 2)->default(0)->after('qty');
        });

        DB::table('load_items')->update(['loaded_qty' => DB::raw('qty')]);

        // Existing loads already had `qty` reduced by invoicing, so add back what was sold.
        if (Schema::hasTable('distribution_invoices') && Schema::hasColumn('distribution_invoices', 'load_id')) {
            DB::statement("
                UPDATE load_items li
                SET li.loaded_qty = li.qty + COALESCE((
                    SELECT SUM(dii.quantity)
                    FROM distribution_invoice_items dii
                    INNER JOIN distribution_invoices di ON di.id = dii.distribution_invoice_id
                    WHERE di.load_id = li.load_id
                      AND dii.item_code = li.product_code
                ), 0)
            ");
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('load_items') && Schema::hasColumn('load_items', 'loaded_qty')) {
            Schema::table('load_items', function (Blueprint $table) {
                $table->dropColumn('loaded_qty');
            });
        }
    }
};
