'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type PayrollEmployee = {
  id: number;
  employee_code?: string;
  first_name?: string;
  last_name?: string;
};

type PayrollStatus = 'pending' | 'processed' | 'paid';

type PayrollRow = {
  id: number;
  month_year?: string;
  basic_salary?: number;
  allowances?: number;
  deductions?: number;
  net_salary?: number;
  working_days?: number;
  present_days?: number;
  absent_days?: number;
  overtime_hours?: number;
  overtime_amount?: number;
  status?: PayrollStatus;
  employee?: PayrollEmployee;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function PayrollReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PayrollStatus>('all');
  const [errorMessage, setErrorMessage] = useState('');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';

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

    const verifyAccess = async () => {
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
                ? role.permissions.map((permission: any) => String(permission?.name || '').trim().toLowerCase())
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await fetchPayrollRows(token, monthFilter || undefined);
      } catch (error) {
        console.error('Error checking payroll report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchPayrollRows = async (authToken?: string, monthYear?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const allRows: PayrollRow[] = [];
      const initialUrl = monthYear
        ? `${API_URL}/api/hr/payrolls?month_year=${encodeURIComponent(monthYear)}`
        : `${API_URL}/api/hr/payrolls`;

      let nextUrl: string | null = initialUrl;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: PaginatedResponse<PayrollRow> } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        });

        const pageRows = Array.isArray(response.data?.data) ? response.data.data : [];
        allRows.push(...pageRows);

        nextUrl = response.data?.next_page_url || null;
        pageCount += 1;
      }

      setRows(allRows);
    } catch (error) {
      console.error('Error fetching payroll report records:', error);
      setRows([]);
      setErrorMessage('Failed to load payroll report data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (!term) return true;

      const employeeName = `${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim().toLowerCase();
      const employeeCode = String(row.employee?.employee_code || '').toLowerCase();
      const month = String(row.month_year || '').toLowerCase();
      const status = String(row.status || '').toLowerCase();

      return (
        employeeName.includes(term) ||
        employeeCode.includes(term) ||
        month.includes(term) ||
        status.includes(term)
      );
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const pending = filteredRows.filter((row) => row.status === 'pending').length;
    const processed = filteredRows.filter((row) => row.status === 'processed').length;
    const paid = filteredRows.filter((row) => row.status === 'paid').length;

    const grossTotal = filteredRows.reduce((sum, row) => sum + Number(row.basic_salary || 0), 0);
    const netTotal = filteredRows.reduce((sum, row) => sum + Number(row.net_salary || 0), 0);

    return { total, pending, processed, paid, grossTotal, netTotal };
  }, [filteredRows]);

  const formatMoney = (value?: number) => {
    const amount = Number(value || 0);
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const rowToExport = (row: PayrollRow) => {
    const employeeName = `${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() || 'Unknown';

    return [
      row.month_year || '-',
      row.employee?.employee_code || '-',
      employeeName,
      formatMoney(row.basic_salary),
      formatMoney(row.allowances),
      formatMoney(row.deductions),
      formatMoney(row.net_salary),
      String(row.working_days ?? '-'),
      String(row.present_days ?? '-'),
      String(row.absent_days ?? '-'),
      String(row.overtime_hours ?? '-'),
      formatMoney(row.overtime_amount),
      row.status ? row.status.toUpperCase() : '-',
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Month',
      'Employee Code',
      'Employee Name',
      'Basic Salary',
      'Allowances',
      'Deductions',
      'Net Salary',
      'Working Days',
      'Present Days',
      'Absent Days',
      'Overtime Hours',
      'Overtime Amount',
      'Status',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Payroll Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Month Filter: ${monthFilter || 'ALL'}`, 40, 72);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Month',
        'Emp Code',
        'Employee Name',
        'Basic',
        'Allow',
        'Deduct',
        'Net',
        'Work',
        'Present',
        'Absent',
        'OT Hrs',
        'OT Amt',
        'Status',
      ]],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [202, 138, 4] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Pending: ${summary.pending}, Processed: ${summary.processed}, Paid: ${summary.paid}, Net Total: ${formatMoney(summary.netTotal)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    return doc;
  };

  const viewPdf = () => {
    const doc = buildPdf();
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  };

  const downloadPdf = () => {
    const doc = buildPdf();
    doc.save(`payroll-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-amber-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Payroll Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Payroll <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">View payroll cycles and export payroll analytics in PDF and CSV formats.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Employee code, name, month"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | PayrollStatus)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="processed">Processed</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchPayrollRows(undefined, monthFilter || undefined)}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-amber-700 hover:to-orange-700 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Apply Filters'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              View PDF
            </button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              Download PDF
            </button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">
              Download CSV (Excel)
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Pending: <strong>{summary.pending}</strong></span>
            <span>Processed: <strong>{summary.processed}</strong></span>
            <span>Paid: <strong>{summary.paid}</strong></span>
            <span>Gross Total: <strong>{formatMoney(summary.grossTotal)}</strong></span>
            <span>Net Total: <strong>{formatMoney(summary.netTotal)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Month</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Basic</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Allowances</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Deductions</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Net</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Present</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Absent</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">OT Hrs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No payroll records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const employeeName = `${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() || 'Unknown';

                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.month_year || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.employee?.employee_code || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{employeeName}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatMoney(row.basic_salary)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatMoney(row.allowances)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatMoney(row.deductions)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-semibold text-right">{formatMoney(row.net_salary)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.present_days ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.absent_days ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.overtime_hours ?? '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                            row.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : row.status === 'processed'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {row.status ? row.status.toUpperCase() : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
