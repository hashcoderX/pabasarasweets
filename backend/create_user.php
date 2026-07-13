<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Support\Facades\Hash;

$role = Role::firstOrCreate(
	['name' => 'Super Admin'],
	[
		'description' => 'Full system access with all permissions',
		'is_active' => true,
	]
);

$user = User::updateOrCreate(
	['email' => 'admin@gmail.com'],
	[
		'name' => 'Super Admin',
		'password' => Hash::make('password'),
		'role' => 'Super Admin',
	]
);

UserRole::updateOrCreate(
	['user_id' => $user->id, 'role_id' => $role->id],
	['assigned_at' => now(), 'assigned_by' => $user->id]
);

echo "Super Admin ready\n";
echo "Email: admin@gmail.com\n";
echo "Password: password\n";