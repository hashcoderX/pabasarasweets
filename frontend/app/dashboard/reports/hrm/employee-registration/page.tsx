'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type EmployeeRow = {
  id: number;
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile?: string;
  join_date?: string;
  employee_type?: string;
  status?: string;
  department?: { id: number; name: string };
  designation?: { id: number; name: string };
  branch?: { id: number; name: string };
};

export default function EmployeeRegistrationReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [designationFilter, setDesignationFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
                ? role.permissions.map((permission: any) =>
                    String(permission?.name || '').trim().toLowerCase()
                  )
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

        await fetchEmployees(token);
      } catch (error) {
        console.error('Error checking employee registration report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchEmployees = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const response = await axios.get('/api/hr/employees', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      const dataRows = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      setRows(dataRows);
    } catch (error) {
      console.error('Error fetching employee registration records:', error);
      setRows([]);
      setErrorMessage('Failed to load employee registration report data.');
    } finally {
      setLoading(false);
    }
  };

  const branchOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.branch?.name)
          .filter((name): name is string => Boolean(name && name.trim()))
      )
    ).sort();
  }, [rows]);

  const departmentOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.department?.name)
          .filter((name): name is string => Boolean(name && name.trim()))
      )
    ).sort();
  }, [rows]);

  const designationOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.designation?.name)
          .filter((name): name is string => Boolean(name && name.trim()))
      )
    ).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'all') {
        const rowStatus = String(row.status || '').toLowerCase();
        if (rowStatus !== statusFilter) return false;
      }

      if (branchFilter !== 'all' && String(row.branch?.name || '') !== branchFilter) return false;
      if (departmentFilter !== 'all' && String(row.department?.name || '') !== departmentFilter) return false;
      if (designationFilter !== 'all' && String(row.designation?.name || '') !== designationFilter) return false;

      if (startDate || endDate) {
        const joinDate = row.join_date ? new Date(row.join_date) : null;
        if (!joinDate || Number.isNaN(joinDate.getTime())) return false;

        if (startDate) {
          const min = new Date(`${startDate}T00:00:00`);
          if (joinDate < min) return false;
        }

        if (endDate) {
          const max = new Date(`${endDate}T23:59:59`);
          if (joinDate > max) return false;
        }
      }

      if (!term) return true;

      const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim().toLowerCase();
      const employeeCode = String(row.employee_code || '').toLowerCase();
      const email = String(row.email || '').toLowerCase();
      const mobile = String(row.mobile || '').toLowerCase();
      const branch = String(row.branch?.name || '').toLowerCase();
      const department = String(row.department?.name || '').toLowerCase();
      const designation = String(row.designation?.name || '').toLowerCase();

      return (
        fullName.includes(term) ||
        employeeCode.includes(term) ||
        email.includes(term) ||
        mobile.includes(term) ||
        branch.includes(term) ||
        department.includes(term) ||
        designation.includes(term)
      );
    });
  }, [rows, search, statusFilter, branchFilter, departmentFilter, designationFilter, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const active = filteredRows.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
    const inactive = filteredRows.filter((row) => String(row.status || '').toLowerCase() === 'inactive').length;

    return { total, active, inactive };
  }, [filteredRows]);

  const toDateLabel = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const rowToExport = (row: EmployeeRow) => {
    const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown';

    return [
      row.employee_code || '-',
      fullName,
      row.email || '-',
      row.mobile || '-',
      row.branch?.name || '-',
      row.department?.name || '-',
      row.designation?.name || '-',
      toDateLabel(row.join_date),
      row.employee_type ? row.employee_type.replace('_', ' ') : '-',
      row.status ? row.status.toUpperCase() : '-',
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Employee Code',
      'Employee Name',
      'Email',
      'Phone',
      'Branch',
      'Department',
      'Designation',
      'Join Date',
      'Employee Type',
      'Status',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employee-registration-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Employee Registration Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Join Date Range: ${startDate || '-'} to ${endDate || '-'}`, 40, 72);
    doc.text(`Filters: Status=${statusFilter}, Branch=${branchFilter}, Department=${departmentFilter}, Designation=${designationFilter}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Emp Code',
        'Name',
        'Email',
        'Phone',
        'Branch',
        'Department',
        'Designation',
        'Join Date',
        'Type',
        'Status',
      ]],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Active: ${summary.active}, Inactive: ${summary.inactive}`,
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
    doc.save(`employee-registration-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-sky-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-sky-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Employee Registration Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Employee Registration <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">View and download employee registration data as PDF and CSV.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, code, email, branch"
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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {branchOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {departmentOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Designation</label>
              <select
                value={designationFilter}
                onChange={(e) => setDesignationFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {designationOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Join From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Join To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>

            <div className="lg:col-span-2 flex items-end">
              <button
                type="button"
                onClick={() => fetchEmployees()}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-blue-700 hover:to-cyan-700 disabled:opacity-60"
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
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Active: <strong>{summary.active}</strong></span>
            <span>Inactive: <strong>{summary.inactive}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Join Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">No employee records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown';
                    const rowStatus = String(row.status || '').toLowerCase();

                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.employee_code || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{fullName}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.mobile || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.branch?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.department?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.designation?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.join_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.employee_type ? row.employee_type.replace('_', ' ') : '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                            rowStatus === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
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
