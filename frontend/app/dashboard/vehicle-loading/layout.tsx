'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function VehicleLoadingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Loads', href: '/dashboard/vehicle-loading/loads', icon: '📦' },
    { name: 'Load Items', href: '/dashboard/vehicle-loading/load-items', icon: '📋' },
    { name: 'Vehicles', href: '/dashboard/vehicle-loading/vehicles', icon: '🚛' },
    { name: 'Routes', href: '/dashboard/vehicle-loading/routes', icon: '🗺️' },
    { name: 'Drivers', href: '/dashboard/vehicle-loading/drivers', icon: '👨‍🚗' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Vehicle Loading Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-gray-900">Vehicle Loading</h1>
              <nav className="flex space-x-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <Link
              href="/dashboard"
              className="text-gray-600 hover:text-gray-900 text-sm font-medium"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full px-3 sm:px-4 lg:px-6 py-8">
        {children}
      </div>
    </div>
  );
}