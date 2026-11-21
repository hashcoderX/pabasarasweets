<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$user = App\Models\User::query()->first();
if (!$user) {
    fwrite(STDERR, "NO_USER\n");
    exit(1);
}

echo $user->createToken('api-test')->plainTextToken;
