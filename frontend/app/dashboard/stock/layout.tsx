'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function StockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Inventory', href: '/dashboard/stock/inventory', icon: '📦' },
    { name: 'Suppliers', href: '/dashboard/stock/suppliers', icon: '🚚' },
    { name: 'Stock Levels', href: '/dashboard/stock/levels', icon: '📊' },
    { name: 'Reports', href: '/dashboard/stock/reports', icon: '📈' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Stock Management Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Stock Management</h1>
              <Link
                href="/dashboard"
                className="inline-flex items-center text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                ← Back to Dashboard
              </Link>
            </div>

            <nav className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible">
              <div className="flex min-w-max gap-2 px-1 sm:min-w-0 sm:flex-wrap sm:gap-3 sm:px-0">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.name}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}