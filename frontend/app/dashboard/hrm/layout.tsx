'use client';

import Link from 'next/link';

export default function HRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* HRM Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center py-4 gap-3 sm:gap-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Human Resources</h1>
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
      <main className="w-full py-6 px-3 sm:px-4 lg:px-6">
        {children}
      </main>
    </div>
  );
}