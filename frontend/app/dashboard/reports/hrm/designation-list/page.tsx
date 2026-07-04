'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type DesignationRow = {
  id: number;
  name?: string;
  description?: string;
  salary_range_min?: number;
  salary_range_max?: number;
  is_active?: boolean;
  created_at?: string;
};

type EmployeeRow = {
  id: number;
  designation_id?: number;
};

type DesignationReportRow = DesignationRow & {
  employee_count: number;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function DesignationListReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DesignationReportRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
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

        await fetchDesignationRows(token);
      } catch (error) {
        console.error('Error checking designation report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchAllPaginated = async <T,>(url: string, tokenToUse: string): Promise<T[]> => {
    const allRows: T[] = [];
    let nextUrl: string | null = url;
    let pageCount = 0;

    while (nextUrl && pageCount < 50) {
      const response: { data: PaginatedResponse<T> } = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });

      const pageRows = Array.isArray(response.data?.data) ? response.data.data : [];
      allRows.push(...pageRows);

      nextUrl = response.data?.next_page_url || null;
      pageCount += 1;
    }

    return allRows;
  };

  const fetchDesignationRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const [designations, employees] = await Promise.all([
        fetchAllPaginated<DesignationRow>(`${API_URL}/api/hr/designations`, tokenToUse),
        axios.get(`${API_URL}/api/hr/employees`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        }).then((res) => (Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : []) as EmployeeRow[]),
      ]);

      const countByDesignationId = employees.reduce<Record<number, number>>((acc, employee) => {
        const key = Number(employee.designation_id || 0);
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const mapped = designations.map((designation) => ({
        ...designation,
        employee_count: countByDesignationId[designation.id] || 0,
      }));

      setRows(mapped);
    } catch (error) {
      console.error('Error fetching designation report records:', error);
      setRows([]);
      setErrorMessage('Failed to load designation list report data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const rowStatus = row.is_active ? 'active' : 'inactive';
      if (statusFilter !== 'all' && rowStatus !== statusFilter) return false;

      if (!term) return true;

      const name = String(row.name || '').toLowerCase();
      const description = String(row.description || '').toLowerCase();

      return name.includes(term) || description.includes(term);
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const active = filteredRows.filter((row) => row.is_active).length;
    const inactive = total - active;
    const totalEmployees = filteredRows.reduce((sum, row) => sum + row.employee_count, 0);

    return { total, active, inactive, totalEmployees };
  }, [filteredRows]);

  const toDateLabel = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const formatMoney = (value?: number) => {
    if (value == null) return '-';
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const rangeLabel = (row: DesignationReportRow) => {
    const min = formatMoney(row.salary_range_min);
    const max = formatMoney(row.salary_range_max);

    if (min === '-' && max === '-') return '-';
    return `${min} - ${max}`;
  };

  const rowToExport = (row: DesignationReportRow) => {
    return [
      row.name || '-',
      row.description || '-',
      rangeLabel(row),
      row.is_active ? 'ACTIVE' : 'INACTIVE',
      String(row.employee_count),
      toDateLabel(row.created_at),
    ];
  };

  const exportCsv = () => {
    const headers = ['Designation Name', 'Description', 'Salary Range', 'Status', 'Employee Count', 'Created Date'];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `designation-list-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Designation List Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 72);

    autoTable(doc, {
      startY: 88,
      head: [['Designation Name', 'Description', 'Salary Range', 'Status', 'Employee Count', 'Created Date']],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [99, 102, 241] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Active: ${summary.active}, Inactive: ${summary.inactive}, Total Employees: ${summary.totalEmployees}`,
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
    doc.save(`designation-list-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-violet-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-indigo-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Designation List Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Designation List <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Designation registry with salary ranges and team-size insight, exportable to PDF and CSV.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Designation name or description"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchDesignationRows()}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh Data'}
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
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Active: <strong>{summary.active}</strong></span>
            <span>Inactive: <strong>{summary.inactive}</strong></span>
            <span>Total Employees: <strong>{summary.totalEmployees}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Designation Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Salary Range</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Employee Count</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Created Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">No designation records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.description || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rangeLabel(row)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.employee_count}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                          row.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
