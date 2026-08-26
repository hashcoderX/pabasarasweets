<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DatabaseBackupController extends Controller
{
    private function isAdminUser($user): bool
    {
        if (!$user || !$user->employee_id) {
            return true;
        }

        $user->loadMissing('roles');

        $roleNames = $user->roles
            ->pluck('name')
            ->push((string) ($user->role ?? ''))
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter();

        return $roleNames->contains(function ($roleName) {
            return str_contains($roleName, 'super admin')
                || str_contains($roleName, 'superadmin')
                || str_contains($roleName, 'administrator')
                || $roleName === 'admin';
        });
    }

    public function download(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $database = DB::getDatabaseName();
        $fileName = $database . '_backup_' . now()->format('Ymd_His') . '.sql';

        $tables = collect(DB::select('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"'))
            ->map(fn ($row) => array_values((array) $row)[0])
            ->all();

        return new StreamedResponse(function () use ($database, $tables) {
            $pdo = DB::getPdo();
            $out = fopen('php://output', 'w');

            fwrite($out, "-- Database backup for `{$database}`\n");
            fwrite($out, '-- Generated at ' . now()->toDateTimeString() . "\n");
            fwrite($out, "SET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n");

            foreach ($tables as $table) {
                $createRow = (array) DB::select('SHOW CREATE TABLE `' . str_replace('`', '``', $table) . '`')[0];
                $createSql = $createRow['Create Table'] ?? array_values($createRow)[1];

                fwrite($out, "DROP TABLE IF EXISTS `{$table}`;\n");
                fwrite($out, $createSql . ";\n\n");

                $rows = DB::table($table)->cursor();
                $buffer = [];

                foreach ($rows as $row) {
                    $values = array_map(function ($value) use ($pdo) {
                        if (is_null($value)) {
                            return 'NULL';
                        }
                        if (is_bool($value)) {
                            return $value ? '1' : '0';
                        }
                        if (is_int($value) || is_float($value)) {
                            return (string) $value;
                        }

                        return $pdo->quote((string) $value);
                    }, (array) $row);

                    $buffer[] = '(' . implode(',', $values) . ')';

                    if (count($buffer) >= 200) {
                        fwrite($out, "INSERT INTO `{$table}` VALUES\n" . implode(",\n", $buffer) . ";\n");
                        $buffer = [];
                        flush();
                    }
                }

                if (!empty($buffer)) {
                    fwrite($out, "INSERT INTO `{$table}` VALUES\n" . implode(",\n", $buffer) . ";\n");
                }

                fwrite($out, "\n");
                flush();
            }

            fwrite($out, "SET FOREIGN_KEY_CHECKS=1;\n");
            fclose($out);
        }, 200, [
            'Content-Type' => 'application/sql',
            'Content-Disposition' => 'attachment; filename="' . $fileName . '"',
            'X-Backup-Filename' => $fileName,
            'Access-Control-Expose-Headers' => 'Content-Disposition, X-Backup-Filename',
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
        ]);
    }
}
