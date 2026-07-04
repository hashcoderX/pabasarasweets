'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type Candidate = {
  id: number;
  candidate_code?: string;
  first_name?: string;
  last_name?: string;
  position_applied?: string;
  status?: string;
};

type Interviewer = {
  id: number;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
};

type InterviewRow = {
  id: number;
  interview_date?: string;
  interview_time?: string;
  interview_notes?: string;
  score?: number | null;
  result?: 'pending' | 'pass' | 'fail' | null;
  candidate?: Candidate;
  interviewers?: Interviewer[];
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function InterviewReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'pending' | 'pass' | 'fail'>('all');
  const [candidateStatusFilter, setCandidateStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

        await fetchInterviewRows(token);
      } catch (error) {
        console.error('Error checking interview report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchInterviewRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const allCandidates: Candidate[] = [];
      let nextUrl: string | null = `${API_URL}/api/hr/candidates`;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: PaginatedResponse<Candidate> } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        });

        const pageRows = Array.isArray(response.data?.data) ? response.data.data : [];
        allCandidates.push(...pageRows);

        nextUrl = response.data?.next_page_url || null;
        pageCount += 1;
      }

      const interviewCollections = await Promise.all(
        allCandidates.map(async (candidate) => {
          try {
            const interviewRes = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}/interviews`, {
              headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
            });

            const candidateInterviews = Array.isArray(interviewRes.data) ? interviewRes.data : [];

            return candidateInterviews.map((item: any) => ({
              id: Number(item.id),
              interview_date: item.interview_date,
              interview_time: item.interview_time,
              interview_notes: item.interview_notes,
              score: item.score,
              result: item.result,
              interviewers: Array.isArray(item.interviewers) ? item.interviewers : [],
              candidate,
            })) as InterviewRow[];
          } catch {
            return [] as InterviewRow[];
          }
        })
      );

      const flattened = interviewCollections.flat().sort((a, b) => {
        const aKey = `${a.interview_date || ''} ${a.interview_time || ''}`;
        const bKey = `${b.interview_date || ''} ${b.interview_time || ''}`;
        return aKey.localeCompare(bKey);
      });

      setRows(flattened);
    } catch (error) {
      console.error('Error fetching interview report records:', error);
      setRows([]);
      setErrorMessage('Failed to load interview report data.');
    } finally {
      setLoading(false);
    }
  };

  const candidateStatusOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => String(row.candidate?.status || ''))
          .filter((status) => Boolean(status.trim()))
      )
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const result = (row.result || 'pending').toLowerCase();
      const candidateStatus = String(row.candidate?.status || '').toLowerCase();

      if (resultFilter !== 'all' && result !== resultFilter) return false;
      if (candidateStatusFilter !== 'all' && candidateStatus !== candidateStatusFilter.toLowerCase()) return false;

      if (startDate || endDate) {
        const interviewDate = row.interview_date ? new Date(`${row.interview_date}T00:00:00`) : null;
        if (!interviewDate || Number.isNaN(interviewDate.getTime())) return false;

        if (startDate) {
          const min = new Date(`${startDate}T00:00:00`);
          if (interviewDate < min) return false;
        }

        if (endDate) {
          const max = new Date(`${endDate}T23:59:59`);
          if (interviewDate > max) return false;
        }
      }

      if (!term) return true;

      const candidateName = `${row.candidate?.first_name || ''} ${row.candidate?.last_name || ''}`.trim().toLowerCase();
      const candidateCode = String(row.candidate?.candidate_code || '').toLowerCase();
      const position = String(row.candidate?.position_applied || '').toLowerCase();
      const interviewerNames = (row.interviewers || [])
        .map((intv) => `${intv.first_name || ''} ${intv.last_name || ''}`.trim())
        .join(' ')
        .toLowerCase();
      const note = String(row.interview_notes || '').toLowerCase();

      return (
        candidateName.includes(term) ||
        candidateCode.includes(term) ||
        position.includes(term) ||
        interviewerNames.includes(term) ||
        note.includes(term)
      );
    });
  }, [rows, search, resultFilter, candidateStatusFilter, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const pending = filteredRows.filter((row) => (row.result || 'pending') === 'pending').length;
    const pass = filteredRows.filter((row) => row.result === 'pass').length;
    const fail = filteredRows.filter((row) => row.result === 'fail').length;

    return { total, pending, pass, fail };
  }, [filteredRows]);

  const toDateLabel = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const toResultLabel = (value?: string | null) => {
    return value ? value.toUpperCase() : 'PENDING';
  };

  const rowToExport = (row: InterviewRow) => {
    const candidateName = `${row.candidate?.first_name || ''} ${row.candidate?.last_name || ''}`.trim() || 'Unknown';
    const interviewerNames = (row.interviewers || [])
      .map((intv) => `${intv.first_name || ''} ${intv.last_name || ''}`.trim())
      .filter(Boolean)
      .join(', ');

    return [
      row.candidate?.candidate_code || '-',
      candidateName,
      row.candidate?.position_applied || '-',
      toDateLabel(row.interview_date),
      row.interview_time || '-',
      interviewerNames || '-',
      row.score != null ? String(row.score) : '-',
      toResultLabel(row.result),
      row.candidate?.status ? row.candidate.status.toUpperCase() : '-',
      row.interview_notes || '-',
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Candidate Code',
      'Candidate Name',
      'Position',
      'Interview Date',
      'Interview Time',
      'Interviewers',
      'Score',
      'Result',
      'Candidate Status',
      'Notes',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `interview-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Interview Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Date Range: ${startDate || '-'} to ${endDate || '-'}`, 40, 72);
    doc.text(`Result Filter: ${resultFilter === 'all' ? 'ALL' : resultFilter.toUpperCase()}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Cand. Code',
        'Candidate',
        'Position',
        'Date',
        'Time',
        'Interviewers',
        'Score',
        'Result',
        'Cand. Status',
      ]],
      body: filteredRows.map((row) => {
        const values = rowToExport(row);
        return [values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8]];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [124, 58, 237] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Pending: ${summary.pending}, Pass: ${summary.pass}, Fail: ${summary.fail}`,
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
    doc.save(`interview-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-violet-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-violet-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Interview Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Interview <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Track interview schedules, outcomes, and interviewer allocation with PDF/CSV export.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Candidate, code, position, interviewer"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Result</label>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value as 'all' | 'pending' | 'pass' | 'fail')}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Candidate Status</label>
              <select
                value={candidateStatusFilter}
                onChange={(e) => setCandidateStatusFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {candidateStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                type="button"
                onClick={() => fetchInterviewRows()}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60"
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
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Pending: <strong>{summary.pending}</strong></span>
            <span>Pass: <strong>{summary.pass}</strong></span>
            <span>Fail: <strong>{summary.fail}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Candidate Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Candidate Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Position</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Interviewers</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Result</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Candidate Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">No interview records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const candidateName = `${row.candidate?.first_name || ''} ${row.candidate?.last_name || ''}`.trim() || 'Unknown';
                    const interviewerNames = (row.interviewers || [])
                      .map((intv) => `${intv.first_name || ''} ${intv.last_name || ''}`.trim())
                      .filter(Boolean)
                      .join(', ');
                    const result = (row.result || 'pending').toLowerCase();

                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.candidate?.candidate_code || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{candidateName}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.candidate?.position_applied || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.interview_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.interview_time || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{interviewerNames || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.score != null ? row.score : '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                            result === 'pass'
                              ? 'bg-green-100 text-green-700'
                              : result === 'fail'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {toResultLabel(row.result)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.candidate?.status ? row.candidate.status.toUpperCase() : '-'}</td>
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
