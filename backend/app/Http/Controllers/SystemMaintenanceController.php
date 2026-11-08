<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Throwable;

class SystemMaintenanceController extends Controller
{
    private function isAdminUser(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if (!$user->employee_id) {
            return true;
        }

        $user->loadMissing('roles');

        $roleNames = $user->roles
            ->pluck('name')
            ->push((string) ($user->role ?? ''))
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter();

        return $roleNames->contains(function (string $roleName): bool {
            return str_contains($roleName, 'super admin')
                || str_contains($roleName, 'superadmin')
                || str_contains($roleName, 'administrator')
                || $roleName === 'admin';
        });
    }

    public function run(Request $request): JsonResponse
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $data = $request->validate([
            'action' => 'required|string|in:cache,garbage,full',
        ]);

        $action = (string) $data['action'];

        try {
            if ($action === 'cache') {
                return response()->json([
                    'message' => 'Cache clear completed.',
                    'action' => 'cache',
                    'result' => $this->clearCachesOnly(),
                ]);
            }

            if ($action === 'garbage') {
                return response()->json([
                    'message' => 'Garbage cleanup completed.',
                    'action' => 'garbage',
                    'result' => $this->garbageCleanupOnly(),
                ]);
            }

            $cache = $this->clearCachesOnly();
            $garbage = $this->garbageCleanupOnly();
            $optimize = $this->runOptimizeCommands();

            return response()->json([
                'message' => 'System optimization completed.',
                'action' => 'full',
                'result' => [
                    'cache' => $cache,
                    'garbage' => $garbage,
                    'optimize' => $optimize,
                ],
            ]);
        } catch (Throwable $exception) {
            return response()->json([
                'message' => 'System maintenance failed.',
                'error' => $exception->getMessage(),
            ], 500);
        }
    }

    private function clearCachesOnly(): array
    {
        $commands = [
            'optimize:clear',
            'cache:clear',
            'config:clear',
            'route:clear',
            'view:clear',
        ];

        $results = [];

        foreach ($commands as $command) {
            $exitCode = Artisan::call($command);
            $results[] = [
                'command' => $command,
                'exit_code' => $exitCode,
                'output' => trim(Artisan::output()),
            ];
        }

        return [
            'commands' => $results,
        ];
    }

    private function garbageCleanupOnly(): array
    {
        $deleted = [
            'framework_cache_files' => 0,
            'framework_session_files' => 0,
            'view_compiled_files' => 0,
            'old_log_files' => 0,
        ];

        $deleted['framework_cache_files'] = $this->purgeFiles(storage_path('framework/cache/data'), 0);
        $deleted['framework_session_files'] = $this->purgeFiles(storage_path('framework/sessions'), 7);
        $deleted['view_compiled_files'] = $this->purgeFiles(storage_path('framework/views'), 0);
        $deleted['old_log_files'] = $this->purgeFiles(storage_path('logs'), 14, 'log');

        return [
            'deleted' => $deleted,
        ];
    }

    private function runOptimizeCommands(): array
    {
        $commands = [
            'config:cache',
            'route:cache',
            'view:cache',
        ];

        $results = [];

        foreach ($commands as $command) {
            $exitCode = Artisan::call($command);
            $results[] = [
                'command' => $command,
                'exit_code' => $exitCode,
                'output' => trim(Artisan::output()),
            ];
        }

        return [
            'commands' => $results,
        ];
    }

    private function purgeFiles(string $path, int $olderThanDays = 0, string $extension = ''): int
    {
        if (!File::isDirectory($path)) {
            return 0;
        }

        $deletedCount = 0;
        $threshold = $olderThanDays > 0 ? now()->subDays($olderThanDays)->getTimestamp() : null;

        foreach (File::allFiles($path) as $file) {
            if ($extension !== '' && strtolower($file->getExtension()) !== strtolower($extension)) {
                continue;
            }

            if ($threshold !== null && $file->getMTime() >= $threshold) {
                continue;
            }

            File::delete($file->getPathname());
            $deletedCount += 1;
        }

        return $deletedCount;
    }
}