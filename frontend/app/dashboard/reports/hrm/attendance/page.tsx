'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day';

type AttendanceEmployee = {
  employee_code?: string;
  first_name?: string;
  last_name?: string;
};

type AttendanceRecord = {
  id: number;
  employee_id: number;
  date: string;
  in_time: string | null;
  out_time: string | null;
  status: AttendanceStatus;
  work_hours: number | null;
  notes: string | null;
  employee?: AttendanceEmployee;
};

export default function AttendanceReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [search, setSearch] = useState('');

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

        await fetchAttendance(storedToken);
      } catch (error) {
        console.error('Error checking attendance report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    const storedToken = token;
    verifyAccess();
  }, [token, router]);

  const fetchAttendance = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        per_page: 2000,
      };

      if (startDate && !endDate) params.date = startDate;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await axios.get('/api/hr/attendance', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params,
      });

      const rows = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      setRecords(rows);
    } catch (error) {
      console.error('Error fetching attendance records:', error);
      alert('Failed to load attendance report.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;

      if (!term) return true;

      const fullName = `${record.employee?.first_name || ''} ${record.employee?.last_name || ''}`.toLowerCase();
      const employeeCode = String(record.employee?.employee_code || '').toLowerCase();
      const status = String(record.status || '').toLowerCase();
      const date = String(record.date || '').toLowerCase();

      return (
        fullName.includes(term) ||
        employeeCode.includes(term) ||
        status.includes(term) ||
        date.includes(term)
      );
    });
  }, [records, search, statusFilter]);

  const reportSummary = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter((r) => r.status === 'present').length;
    const absent = filteredRecords.filter((r) => r.status === 'absent').length;
    const late = filteredRecords.filter((r) => r.status === 'late').length;
    const halfDay = filteredRecords.filter((r) => r.status === 'half_day').length;

    return { total, present, absent, late, halfDay };
  }, [filteredRecords]);

  const toDateLabel = (value: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const exportCsv = () => {
    const headers = ['Date', 'Employee Code', 'Employee Name', 'Status', 'In Time', 'Out Time', 'Work Hours', 'Notes'];

    const rows = filteredRecords.map((record) => {
      const employeeName = `${record.employee?.first_name || ''} ${record.employee?.last_name || ''}`.trim() || 'Unknown';
      return [
        toDateLabel(record.date),
        record.employee?.employee_code || '-',
        employeeName,
        record.status.replace('_', ' ').toUpperCase(),
        record.in_time || '-',
        record.out_time || '-',
        record.work_hours != null ? String(record.work_hours) : '-',
        record.notes || '-',
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Attendance Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Date Range: ${startDate || '-'} to ${endDate || '-'}`, 40, 72);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'All' : statusFilter}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [['Date', 'Employee Code', 'Employee Name', 'Status', 'In Time', 'Out Time', 'Work Hours', 'Notes']],
      body: filteredRecords.map((record) => {
        const employeeName = `${record.employee?.first_name || ''} ${record.employee?.last_name || ''}`.trim() || 'Unknown';
        return [
          toDateLabel(record.date),
          record.employee?.employee_code || '-',
          employeeName,
          record.status.replace('_', ' ').toUpperCase(),
          record.in_time || '-',
          record.out_time || '-',
          record.work_hours != null ? String(record.work_hours) : '-',
          record.notes || '-',
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 118, 110] },
      margin: { left: 20, right: 20 },
      didDrawPage: (data) => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${reportSummary.total}, Present: ${reportSummary.present}, Absent: ${reportSummary.absent}, Late: ${reportSummary.late}, Half Day: ${reportSummary.halfDay}`,
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
    doc.save(`attendance-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
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
              <span>Attendance Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Attendance <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">View, export to PDF, download PDF, and export CSV for Excel.</p>
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | AttendanceStatus)} className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2">
                <option value="all">All</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name" className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchAttendance()}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-blue-700 hover:to-cyan-700 disabled:opacity-60"
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
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{reportSummary.total}</strong></span>
            <span>Present: <strong>{reportSummary.present}</strong></span>
            <span>Absent: <strong>{reportSummary.absent}</strong></span>
            <span>Late: <strong>{reportSummary.late}</strong></span>
            <span>Half Day: <strong>{reportSummary.halfDay}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Employee Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">In Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Out Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Work Hours</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No attendance records found.</td>
                  </tr>
                ) : (
                  filteredRecords.map((record, idx) => {
                    const employeeName = `${record.employee?.first_name || ''} ${record.employee?.last_name || ''}`.trim() || 'Unknown';
                    return (
                      <tr key={record.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(record.date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{record.employee?.employee_code || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{employeeName}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                            record.status === 'present'
                              ? 'bg-green-100 text-green-700'
                              : record.status === 'absent'
                                ? 'bg-red-100 text-red-700'
                                : record.status === 'late'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-blue-100 text-blue-700'
                          }`}>
                            {record.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{record.in_time || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{record.out_time || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{record.work_hours != null ? record.work_hours : '-'}</td>
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
