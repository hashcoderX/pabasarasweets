'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

type ReportItem = {
  name: string;
  description: string;
  icon: string;
  path?: string;
  comingSoon?: boolean;
};

type ReportCategory = {
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  reports: ReportItem[];
};

export default function ReportsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [reportPermission, setReportPermission] = useState(false);
  const [isSalesRefUser, setIsSalesRefUser] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const fetchAccessProfile = async () => {
      try {
        const userRes = await axios.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);

        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role: any) => String(role?.name || role || ''))
            : []),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role: any) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission: any) =>
                    String(permission?.name || '').trim().toLowerCase()
                  )
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const adminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));
        const isSalesRef =
          roleBlob.includes('sales ref') ||
          roleBlob.includes('sales representative') ||
          roleBlob.includes('sales_ref');

        setIsAdminUser(adminUser);
        setReportPermission(hasReportPermission);
        setIsSalesRefUser(isSalesRef);

        if (!adminUser && !hasReportPermission && !isSalesRef) {
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error fetching reports access profile:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    fetchAccessProfile();
  }, [token, router]);

  const categories: ReportCategory[] = useMemo(
    () => [
      {
        name: 'HRM Reports',
        icon: '👥',
        color: 'from-blue-500 to-cyan-500',
        bgColor: 'from-blue-50 to-cyan-50',
        reports: [
          { name: 'Attendance Report', description: 'Attendance logs and daily summaries', icon: '📅', path: '/dashboard/reports/hrm/attendance' },
          { name: 'Employee Registration Report', description: 'Employee onboarding and profile register', icon: '🧾', path: '/dashboard/reports/hrm/employee-registration' },
          { name: 'CV List Report', description: 'Candidate CV list and status overview', icon: '📄', path: '/dashboard/reports/hrm/cv-list' },
          { name: 'Interview Report', description: 'Interview schedules and outcomes', icon: '🎤', path: '/dashboard/reports/hrm/interview' },
          { name: 'Payroll Report', description: 'Salary, deductions, and payroll summary', icon: '💰', path: '/dashboard/reports/hrm/payroll' },
          { name: 'Department List Report', description: 'Department structure and allocations', icon: '🏢', path: '/dashboard/reports/hrm/department-list' },
          { name: 'Designation List Report', description: 'Designation and position mapping', icon: '👔', path: '/dashboard/reports/hrm/designation-list' },
        ],
      },
      {
        name: 'Purchasing Reports',
        icon: '🛒',
        color: 'from-cyan-500 to-blue-500',
        bgColor: 'from-cyan-50 to-blue-50',
        reports: [
          { name: 'PO Report', description: 'Purchase order register and status', icon: '📑', path: '/dashboard/reports/purchasing/po' },
          { name: 'GRN Report', description: 'Goods received note analytics', icon: '📥', path: '/dashboard/reports/purchasing/grn' },
        ],
      },
      {
        name: 'Stock Reports',
        icon: '📦',
        color: 'from-orange-500 to-red-500',
        bgColor: 'from-orange-50 to-red-50',
        reports: [
          { name: 'Full Stock Report', description: 'Overall stock by item and category', icon: '📦', path: '/dashboard/reports/stock/full' },
          { name: 'Raw Material Stock Report', description: 'Raw material quantities and movements', icon: '🧱', path: '/dashboard/reports/stock/raw-material' },
          { name: 'Finished Good Stock Report', description: 'Finished goods availability and trends', icon: '✅', path: '/dashboard/reports/stock/finished-good' },
          { name: 'Full Stock Valuation Report', description: 'Inventory value by product and total', icon: '💹', path: '/dashboard/reports/stock/valuation' },
        ],
      },
      {
        name: 'Vehicle Loading Reports',
        icon: '🚛',
        color: 'from-indigo-500 to-blue-500',
        bgColor: 'from-indigo-50 to-blue-50',
        reports: [
          { name: 'Vehicle Loading Report', description: 'Load schedules, routes, and quantities', icon: '🧾', path: '/dashboard/reports/vehicle-loading' },
          { name: 'Vehicle Loading Full Valuation Report', description: 'Load value by vehicle and route', icon: '📊', path: '/dashboard/reports/vehicle-loading/valuation' },
        ],
      },
      {
        name: 'Distribution Reports',
        icon: '🚚',
        color: 'from-green-500 to-teal-500',
        bgColor: 'from-green-50 to-teal-50',
        reports: [
          { name: 'Customer Report', description: 'Customer profile and route insights', icon: '👤', path: '/dashboard/reports/distribution/customer' },
          { name: 'Outstanding Report', description: 'Outstanding balances and aging', icon: '⏳', path: '/dashboard/reports/distribution/outstanding' },
          { name: 'Invoice Report', description: 'Invoice summary and trend analysis', icon: '🧾', path: '/dashboard/reports/distribution/invoice' },
          { name: 'Sales Report', description: 'Sales value by invoice with collection tracking', icon: '📈', path: '/dashboard/reports/distribution/sales' },
          { name: 'Delivery Balance Sheet', description: 'Delivery-wise net sales, returns and outstanding', icon: '📚', path: '/dashboard/reports/distribution/delivery-balance' },
          { name: 'Collection Report', description: 'Collections by customer and date', icon: '💵', path: '/dashboard/reports/distribution/collection' },
          { name: 'Returns Report', description: 'Product returns and settlement summary', icon: '↩️', path: '/dashboard/reports/distribution/returns' },
          { name: 'Discount Report', description: 'Sold qty by item grouped by discount percent', icon: '🏷️', path: '/dashboard/reports/distribution/discount' },
          { name: 'Payment History Report', description: 'Payment timeline and mode analytics', icon: '📚', path: '/dashboard/reports/distribution/payment-history' },
        ],
      },
    ],
    []
  );

  const visibleCategories = useMemo(
    () => (isSalesRefUser ? categories.filter((category) => category.name === 'Distribution Reports') : categories),
    [categories, isSalesRefUser]
  );

  const totalReports = visibleCategories.reduce((sum, category) => sum + category.reports.length, 0);

  const handleReportOpen = (report: ReportItem) => {
    if (report.path) {
      router.push(report.path);
      return;
    }

    if (report.comingSoon) {
      alert(`${report.name} will be implemented next.`);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  if (!isAdminUser && !reportPermission && !isSalesRefUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-rose-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Reports Module Ready</span>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  router.push('/');
                }}
                className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <div className="inline-block p-1 bg-gradient-to-r from-rose-500 to-orange-500 rounded-full mb-6">
            <div className="bg-white rounded-full p-4">
              <span className="text-4xl">📊</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Reports <span className="bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent">Center</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Unified report hub organized by business area. You can provide report topics one-by-one, and each report will be implemented in this module.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/80 border border-white/70 px-4 py-2 text-sm text-gray-700 shadow">
            <span className="font-semibold">{totalReports}</span>
            <span>report options configured</span>
          </div>
        </div>

        <div className="space-y-8">
          {visibleCategories.map((category) => (
            <section key={category.name} className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className={`bg-gradient-to-r ${category.color} p-5`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">{category.icon}</div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{category.name}</h2>
                    <p className="text-white/85 text-sm">{category.reports.length} reports available in this category</p>
                  </div>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.reports.map((report) => (
                  <button
                    key={report.name}
                    type="button"
                    onClick={() => handleReportOpen(report)}
                    className={`text-left group relative rounded-xl border border-white/40 bg-gradient-to-br ${category.bgColor} p-4 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xl mb-2">{report.icon}</div>
                        <h3 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">{report.name}</h3>
                        <p className="mt-1 text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">{report.description}</p>
                      </div>
                      <span className="shrink-0 inline-flex items-center rounded-full bg-white/80 border border-white text-[10px] font-semibold px-2 py-1 text-gray-700">
                        {report.comingSoon ? 'Planned' : 'Live'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
