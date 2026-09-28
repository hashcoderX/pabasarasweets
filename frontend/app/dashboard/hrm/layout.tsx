'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Employees', href: '/dashboard/hrm/employees', icon: '👥' },
    { name: 'Departments', href: '/dashboard/hrm/departments', icon: '🏢' },
    { name: 'Designations', href: '/dashboard/hrm/designations', icon: '📋' },
    { name: 'Candidates', href: '/dashboard/hrm/candidates', icon: '🎯' },
    { name: 'Sales Targets ⭐', href: '/dashboard/hrm/sales-targets', icon: '📈' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HRM Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center py-4 gap-3 sm:gap-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-8 gap-2 sm:gap-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Human Resources</h1>
              <nav className="flex space-x-3 sm:space-x-6 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
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
            <div className="flex justify-end">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}