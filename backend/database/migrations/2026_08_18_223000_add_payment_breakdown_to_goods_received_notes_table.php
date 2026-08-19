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
        Schema::table('goods_received_notes', function (Blueprint $table) {
            if (!Schema::hasColumn('goods_received_notes', 'payment_breakdown')) {
                $table->json('payment_breakdown')->nullable()->after('payment_company_id');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            if (Schema::hasColumn('goods_received_notes', 'payment_breakdown')) {
                $table->dropColumn('payment_breakdown');
            }
        });
    }
};
