'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApiClient } from '@/lib/apiClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceRow = {
  id: number;
  invoice_number?: string;
  invoice_date?: string;
  total?: number;
  status?: string;
};

type DistributionPaymentRow = {
  id: number;
  payment_number?: string;
  payment_date?: string;
  amount?: number;
  payment_method?: string;
  status?: string;
  reference_no?: string | null;
  customer?: {
    shop_name?: string;
    customer_code?: string;
  } | null;
};

type CashRow = {
  id: number | string;
  date?: string;
  type?: 'in' | 'out';
  amount?: number;
  reference?: string | null;
  note?: string | null;
};

type IncomeRow = {
  id: string;
  date: string;
  source: 'Invoice Collections' | 'Petty Cash In' | 'Delivery Cash In' | 'Other Cash In';
  amount: number;
  reference: string;
  details: string;
};

type PaginatedPayload<T> = {
  data?: T[];
  next_page_url?: string | null;
};

const money = (value: number) => Number(value || 0).toLocaleString(undefined, {
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

export default function IncomeReportPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [distributionPayments, setDistributionPayments] = useState<DistributionPaymentRow[]>([]);
  const [pettyCash, setPettyCash] = useState<CashRow[]>([]);
  const [deliveryCash, setDeliveryCash] = useState<CashRow[]>([]);
  const [mainCash, setMainCash] = useState<CashRow[]>([]);
  const [fromDate, setFromDate] = useState(yearStart);
  const [toDate, setToDate] = useState(today);
  const [sourceFilter, setSourceFilter] = useState<'all' | IncomeRow['source']>('all');
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
      const rows: T[] = [];
      let nextUrl: string | null = `${endpoint}?per_page=500`;
      let pages = 0;

      while (nextUrl && pages < 100) {
        const response = await api.get(nextUrl);
        const payload: PaginatedPayload<T> = response.data?.data || response.data;

        if (Array.isArray(payload)) {
          rows.push(...payload);
          break;
        }

        rows.push(...(Array.isArray(payload?.data) ? payload.data : []));
        nextUrl = payload?.next_page_url || null;
        pages += 1;
      }

      return rows;
    };

    const loadReport = async () => {
      try {
        setLoading(true);
        setErrorMessage('');

        const [invoiceRows, paymentRows, pettyRows, deliveryRows, mainRows] = await Promise.all([
          fetchAll<InvoiceRow>('/distribution/invoices'),
          fetchAll<DistributionPaymentRow>('/distribution/payments'),
          fetchAll<CashRow>('/petty-cash-transactions'),
          fetchAll<CashRow>('/delivery-cash-transactions'),
          fetchAll<CashRow>('/main-cash-transactions'),
        ]);

        setInvoices(invoiceRows);
        setDistributionPayments(paymentRows);
        setPettyCash(pettyRows);
        setDeliveryCash(deliveryRows);
        setMainCash(mainRows);
      } catch (error) {
        console.error('Failed to load income report data:', error);
        setErrorMessage('Unable to load income report data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [api, token]);

  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => {
      const date = String(invoice.invoice_date || '').slice(0, 10);
      return date >= fromDate && date <= toDate && String(invoice.status || '').toLowerCase() !== 'cancelled';
    }),
    [invoices, fromDate, toDate]
  );

  const invoiceSalesTotal = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);

  const filteredCollectionRows = useMemo(() => {
    return distributionPayments.filter((row) => {
      const date = String(row.payment_date || '').slice(0, 10);
      const status = String(row.status || '').toLowerCase();
      return date >= fromDate && date <= toDate && status !== 'bounced';
    });
  }, [distributionPayments, fromDate, toDate]);

  const collectionTotal = filteredCollectionRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const cashInRows = useMemo(() => {
    const rows: IncomeRow[] = [];

    filteredCollectionRows.forEach((row) => {
      const customerName = String(row.customer?.shop_name || '').trim();
      const customerCode = String(row.customer?.customer_code || '').trim();
      rows.push({
        id: `collection-${row.id}`,
        date: String(row.payment_date || '').slice(0, 10),
        source: 'Invoice Collections',
        amount: Number(row.amount || 0),
        reference: String(row.payment_number || row.reference_no || '-'),
        details: customerName
          ? `${customerName}${customerCode ? ` (${customerCode})` : ''} · ${String(row.payment_method || 'cash')}`
          : String(row.payment_method || 'cash'),
      });
    });

    const appendLedgerIncomes = (rowsInput: CashRow[], source: IncomeRow['source']) => {
      rowsInput.forEach((row) => {
        const date = String(row.date || '').slice(0, 10);
        if (date < fromDate || date > toDate || row.type !== 'in') return;

        rows.push({
          id: `${source}-${row.id}`,
          date,
          source,
          amount: Number(row.amount || 0),
          reference: String(row.reference || '-'),
          details: String(row.note || '-'),
        });
      });
    };

    appendLedgerIncomes(pettyCash, 'Petty Cash In');
    appendLedgerIncomes(deliveryCash, 'Delivery Cash In');
    appendLedgerIncomes(mainCash, 'Other Cash In');

    return rows.sort((first, second) => {
      if (first.date === second.date) return second.id.localeCompare(first.id);
      return second.date.localeCompare(first.date);
    });
  }, [filteredCollectionRows, pettyCash, deliveryCash, mainCash, fromDate, toDate]);

  const cashIncomeTotal = cashInRows.reduce((sum, row) => sum + row.amount, 0);

  const incomeBySource = useMemo(() => {
    const sources: IncomeRow['source'][] = ['Invoice Collections', 'Petty Cash In', 'Delivery Cash In', 'Other Cash In'];
    return sources.map((source) => ({
      source,
      amount: cashInRows
        .filter((row) => row.source === source)
        .reduce((sum, row) => sum + row.amount, 0),
    }));
  }, [cashInRows]);

  const sourcePillClass = (source: IncomeRow['source']) => {
    if (source === 'Invoice Collections') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (source === 'Petty Cash In') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (source === 'Delivery Cash In') return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    return 'bg-violet-100 text-violet-800 border-violet-200';
  };

  const totalIncomeBySource = incomeBySource.reduce((sum, row) => sum + row.amount, 0);

  const filteredIncomeRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return cashInRows.filter((row) => {
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
      if (!term) return true;

      return (
        row.source.toLowerCase().includes(term) ||
        row.reference.toLowerCase().includes(term) ||
        row.details.toLowerCase().includes(term) ||
        row.date.toLowerCase().includes(term)
      );
    });
  }, [cashInRows, sourceFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredIncomeRows.length / pageSize));
  const pagedIncomeRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredIncomeRows.slice(start, start + pageSize);
  }, [filteredIncomeRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sourceFilter, searchTerm, fromDate, toDate]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const rowToExport = (row: IncomeRow) => [
    row.date || '-',
    row.source,
    row.reference || '-',
    row.details || '-',
    Number(row.amount || 0).toFixed(2),
  ];

  const exportCsv = () => {
    const headers = ['Date', 'Source', 'Reference', 'Details', 'Amount'];
    const csvContent = [headers, ...filteredIncomeRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `accounting-income-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Accounting Income Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Date Range: ${fromDate} to ${toDate}`, 40, 72);
    doc.text(`Source Filter: ${sourceFilter === 'all' ? 'ALL' : sourceFilter}`, 40, 86);
    doc.text(`Search: ${searchTerm.trim() || 'N/A'}`, 40, 100);

    autoTable(doc, {
      startY: 114,
      head: [['Date', 'Source', 'Reference', 'Details', 'Amount']],
      body: filteredIncomeRows.map((row) => rowToExport(row)),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [14, 116, 144] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Rows: ${filteredIncomeRows.length} | Billed Sales: ${money(invoiceSalesTotal)} | Cash Income: ${money(cashIncomeTotal)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    doc.save(`accounting-income-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="rounded-2xl border border-cyan-100 bg-white/85 px-6 py-5 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Preparing Income Report</p>
              <p className="text-xs text-slate-500">Loading collections and cash-in transactions...</p>
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
              <p className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">Income Report</p>
              <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Revenue & Cash Inflow Overview</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-2xl">
                Track billed invoice sales and all incoming cash flows from customer collections, petty cash, delivery cash, and other main cash inflows.
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Billed Sales</p>
            <p className="mt-2 text-3xl font-black text-emerald-900">{money(invoiceSalesTotal)}</p>
            <p className="mt-2 text-xs text-emerald-700">{filteredInvoices.length} invoice(s) in period</p>
          </article>
          <article className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Cash Income</p>
            <p className="mt-2 text-3xl font-black text-cyan-900">{money(cashIncomeTotal)}</p>
            <p className="mt-2 text-xs text-cyan-700">{cashInRows.length} income transaction(s)</p>
          </article>
          <article className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Collection Ratio</p>
            <p className="mt-2 text-3xl font-black text-violet-900">{invoiceSalesTotal > 0 ? ((collectionTotal / invoiceSalesTotal) * 100).toFixed(2) : '0.00'}%</p>
            <p className="mt-2 text-xs text-violet-700">Collections vs billed sales</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-cyan-50">
            <h2 className="font-semibold text-slate-900">Income Breakdown by Source</h2>
            <p className="text-xs text-slate-600 mt-0.5">Distribution collections plus all cash-in streams.</p>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            {incomeBySource.map((row) => {
              const share = totalIncomeBySource > 0 ? (row.amount / totalIncomeBySource) * 100 : 0;
              return (
                <div key={row.source} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">{row.source}</p>
                    <p className="text-sm font-bold text-cyan-700">{money(row.amount)}</p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: `${Math.min(100, share)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{share.toFixed(2)}% of total income</p>
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Total Cash Income</p>
              <p className="text-sm font-black text-slate-900">{money(cashIncomeTotal)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-emerald-50">
            <h2 className="font-semibold text-slate-900">Income Transactions</h2>
            <p className="text-xs text-slate-600 mt-0.5">All inbound records included in the selected period.</p>
          </div>
          <div className="px-5 py-4 border-b border-gray-100 bg-white/80">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as 'all' | IncomeRow['source'])}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="all">All Sources</option>
                  <option value="Invoice Collections">Invoice Collections</option>
                  <option value="Petty Cash In">Petty Cash In</option>
                  <option value="Delivery Cash In">Delivery Cash In</option>
                  <option value="Other Cash In">Other Cash In</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Search</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by date, source, reference, or details"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">Showing {filteredIncomeRows.length} transaction(s)</p>
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
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Source</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Reference</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Details</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pagedIncomeRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      No income transactions found for current filters.
                    </td>
                  </tr>
                ) : (
                  pagedIncomeRows.map((row, index) => (
                    <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-5 py-3 text-slate-700">{row.date || '-'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourcePillClass(row.source)}`}>
                          {row.source}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{row.reference || '-'}</td>
                      <td className="px-5 py-3 text-slate-700">{row.details || '-'}</td>
                      <td className="px-5 py-3 text-right font-bold text-cyan-700">{money(row.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredIncomeRows.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-white/85 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <div>
                {(() => {
                  const start = (currentPage - 1) * pageSize + 1;
                  const end = Math.min(filteredIncomeRows.length, currentPage * pageSize);
                  return `Showing ${start}-${end} of ${filteredIncomeRows.length} transactions`;
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
