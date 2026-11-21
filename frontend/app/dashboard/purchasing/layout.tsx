'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function PurchasingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Purchase Orders', href: '/dashboard/purchasing/purchase-orders', icon: '📋' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Purchasing Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-gray-900">Purchasing</h1>
              <nav className="flex space-x-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'bg-blue-100 text-blue-700'
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
      <main className="w-full py-6 px-3 sm:px-4 lg:px-6">
        {children}
      </main>
    </div>
  );
}