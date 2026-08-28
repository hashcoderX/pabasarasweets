'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createApiClient } from '@/lib/apiClient';

type DeliveryCashRow = {
  id: number | string;
  date?: string;
  type?: 'in' | 'out';
  amount?: number;
  reference?: string | null;
  note?: string | null;
};

type PaginatedPayload<T> = {
  data?: T[];
  next_page_url?: string | null;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const today = new Date().toISOString().split('T')[0];
const yearStart = `${new Date().getFullYear()}-01-01`;

const monthStart = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-01`;
};

export default function DeliveryCashAccountReportPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [rows, setRows] = useState<DeliveryCashRow[]>([]);
  const [fromDate, setFromDate] = useState(yearStart);
  const [toDate, setToDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 15;
  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

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

    const fetchAll = async <T,>(endpoint: string): Promise<T[]> => {
      const allRows: T[] = [];
      let nextUrl: string | null = `${endpoint}?per_page=500`;
      let pages = 0;

      while (nextUrl && pages < 100) {
        const response = await api.get(nextUrl);
        const payload: PaginatedPayload<T> = response.data?.data || response.data;

        if (Array.isArray(payload)) {
          allRows.push(...payload);
          break;
        }

        allRows.push(...(Array.isArray(payload?.data) ? payload.data : []));
        nextUrl = payload?.next_page_url || null;
        pages += 1;
      }

      return allRows;
    };

    const loadReport = async () => {
      try {
        setLoading(true);
        setErrorMessage('');
        const deliveryRows = await fetchAll<DeliveryCashRow>('/delivery-cash-transactions');
        setRows(deliveryRows);
      } catch (error) {
        console.error('Failed to load delivery cash report data:', error);
        setErrorMessage('Unable to load delivery cash report data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [api, token]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return rows
      .filter((row) => {
        const date = String(row.date || '').slice(0, 10);
        return date >= fromDate && date <= toDate;
      })
      .filter((row) => (typeFilter === 'all' ? true : row.type === typeFilter))
      .filter((row) => {
        if (!term) return true;
        return (
          String(row.date || '').toLowerCase().includes(term) ||
          String(row.reference || '').toLowerCase().includes(term) ||
          String(row.note || '').toLowerCase().includes(term) ||
          String(row.type || '').toLowerCase().includes(term)
        );
      })
      .sort((first, second) => {
        const a = String(first.date || '');
        const b = String(second.date || '');
        if (a === b) return String(second.id).localeCompare(String(first.id));
        return b.localeCompare(a);
      });
  }, [rows, fromDate, toDate, typeFilter, searchTerm]);

  const totals = useMemo(() => {
    const cashIn = filteredRows
      .filter((row) => row.type === 'in')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const cashOut = filteredRows
      .filter((row) => row.type === 'out')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      cashIn,
      cashOut,
      balance: cashIn - cashOut,
    };
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, typeFilter, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const typePillClass = (type?: 'in' | 'out') => {
    if (type === 'in') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    return 'bg-rose-100 text-rose-800 border-rose-200';
  };

  const rowToExport = (row: DeliveryCashRow) => [
    String(row.date || '-'),
    row.type === 'in' ? 'Cash In' : 'Cash Out',
    String(row.reference || '-'),
    String(row.note || '-'),
    Number(row.amount || 0).toFixed(2),
  ];

  const exportCsv = () => {
    const headers = ['Date', 'Type', 'Reference', 'Note', 'Amount'];
    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `delivery-cash-account-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Delivery Cash Account Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Date Range: ${fromDate} to ${toDate}`, 40, 72);
    doc.text(`Type Filter: ${typeFilter === 'all' ? 'ALL' : typeFilter.toUpperCase()}`, 40, 86);
    doc.text(`Search: ${searchTerm.trim() || 'N/A'}`, 40, 100);

    autoTable(doc, {
      startY: 114,
      head: [['Date', 'Type', 'Reference', 'Note', 'Amount']],
      body: filteredRows.map((row) => rowToExport(row)),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [14, 116, 144] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Rows: ${filteredRows.length} | Cash In: ${money(totals.cashIn)} | Cash Out: ${money(totals.cashOut)} | Net: ${money(totals.balance)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    doc.save(`delivery-cash-account-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="rounded-2xl border border-cyan-100 bg-white/85 px-6 py-5 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Preparing Delivery Cash Report</p>
              <p className="text-xs text-slate-500">Loading delivery cash transactions...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-35">
        <div className="absolute -top-16 -left-14 h-72 w-72 rounded-full bg-emerald-300 blur-3xl" />
        <div className="absolute top-24 right-0 h-80 w-80 rounded-full bg-cyan-300 blur-3xl" />
        <div className="absolute -bottom-12 left-1/3 h-72 w-72 rounded-full bg-teal-300 blur-3xl" />
      </div>

      <nav className="bg-white/82 backdrop-blur-lg shadow border-b border-white/50 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard/reports" className="text-sm font-semibold text-slate-700 hover:text-cyan-700 transition-colors">← Back to Reports</Link>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold tracking-wide uppercase text-cyan-700">Accounting</span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6 relative z-10">
        <section className="rounded-3xl border border-white/70 bg-white/80 backdrop-blur-lg p-6 md:p-7 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">Delivery Cash Account Report</p>
              <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Delivery Cash Inflow & Outflow</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-2xl">
                Analyze delivery collections and outflows with filters, pagination, and downloadable report outputs.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-emerald-50 px-4 py-3 min-w-[220px]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Selected Range</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{fromDate} to {toDate}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <label className="text-sm font-semibold text-slate-700">
              From date
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              To date
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-slate-700">Quick ranges</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setFromDate(monthStart()); setToDate(today); }} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition-colors">This month</button>
                <button type="button" onClick={() => { setFromDate(yearStart); setToDate(today); }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">This year</button>
              </div>
            </div>
          </div>
          {errorMessage && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Cash In</p>
            <p className="mt-2 text-3xl font-black text-emerald-900">{money(totals.cashIn)}</p>
            <p className="mt-2 text-xs text-emerald-700">Collections and incoming entries</p>
          </article>
          <article className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Cash Out</p>
            <p className="mt-2 text-3xl font-black text-rose-900">{money(totals.cashOut)}</p>
            <p className="mt-2 text-xs text-rose-700">Expenses and deductions</p>
          </article>
          <article className={`rounded-2xl border p-5 shadow-lg ${totals.balance >= 0 ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white' : 'border-orange-200 bg-gradient-to-br from-orange-50 to-white'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Net Balance</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{money(Math.abs(totals.balance))}</p>
            <p className="mt-2 text-xs text-slate-600">{totals.balance >= 0 ? 'Positive balance' : 'Negative balance'}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-cyan-50">
            <h2 className="font-semibold text-slate-900">Delivery Cash Transactions</h2>
            <p className="text-xs text-slate-600 mt-0.5">Apply filters, paginate, and download as CSV/PDF.</p>
          </div>

          <div className="px-5 py-4 border-b border-gray-100 bg-white/80">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Type</label>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as 'all' | 'in' | 'out')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="all">All</option>
                  <option value="in">Cash In</option>
                  <option value="out">Cash Out</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Search</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by date, reference, note, or type"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">Showing {filteredRows.length} transaction(s)</p>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100">Download CSV</button>
                <button type="button" onClick={downloadPdf} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Download PDF</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Date</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Type</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Reference</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Note</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      No transactions found for current filters.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, index) => (
                    <tr key={String(row.id)} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-5 py-3 text-slate-700">{row.date || '-'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${typePillClass(row.type)}`}>
                          {row.type === 'in' ? 'Cash In' : 'Cash Out'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{row.reference || '-'}</td>
                      <td className="px-5 py-3 text-slate-700">{row.note || '-'}</td>
                      <td className={`px-5 py-3 text-right font-bold ${row.type === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {money(Number(row.amount || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-white/85 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <div>
                {(() => {
                  const start = (currentPage - 1) * pageSize + 1;
                  const end = Math.min(filteredRows.length, currentPage * pageSize);
                  return `Showing ${start}-${end} of ${filteredRows.length} transactions`;
                })()}
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
