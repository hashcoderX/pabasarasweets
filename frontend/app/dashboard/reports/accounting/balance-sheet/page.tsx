'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createApiClient } from '@/lib/apiClient';

type InvoiceRow = {
  id: number;
  invoice_number?: string;
  invoice_date?: string;
  total?: number;
  paid_amount?: number;
  due_amount?: number;
  balance_amount?: number;
  status?: string;
  customer?: {
    shop_name?: string;
    customer_code?: string;
  } | null;
};

type GrnRow = {
  id: number;
  grn_number?: string;
  received_date?: string;
  status?: string;
  payment_timing?: 'post_payment' | 'on_time' | string;
  net_amount?: number;
  paid_amount?: number;
  purchase_order?: {
    supplier?: {
      name?: string;
    } | null;
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

type CompanyRow = {
  id: number;
  name?: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
};

type PaginatedPayload<T> = {
  data?: T[];
  next_page_url?: string | null;
};

type DetailRow = {
  id: string;
  category: 'Asset' | 'Liability';
  item: string;
  date: string;
  reference: string;
  details: string;
  amount: number;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const today = new Date().toISOString().split('T')[0];

export default function BalanceSheetReportPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [asOfDate, setAsOfDate] = useState(today);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'cash' | 'receivables' | 'payables'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [pettyCash, setPettyCash] = useState<CashRow[]>([]);
  const [deliveryCash, setDeliveryCash] = useState<CashRow[]>([]);
  const [mainCash, setMainCash] = useState<CashRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);
  const pageSize = 15;

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
        const payload: PaginatedPayload<T> | T[] = response.data?.data || response.data;

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

        const [invoiceRows, grnRows, pettyRows, deliveryRows, mainRows, companyRes] = await Promise.all([
          fetchAll<InvoiceRow>('/distribution/invoices'),
          fetchAll<GrnRow>('/purchasing/grn'),
          fetchAll<CashRow>('/petty-cash-transactions'),
          fetchAll<CashRow>('/delivery-cash-transactions'),
          fetchAll<CashRow>('/main-cash-transactions'),
          api.get('/companies'),
        ]);

        const companyPayload = companyRes.data?.data || companyRes.data;
        const companyRows = (Array.isArray(companyPayload) ? companyPayload : []) as CompanyRow[];

        setInvoices(invoiceRows);
        setGrns(grnRows);
        setPettyCash(pettyRows);
        setDeliveryCash(deliveryRows);
        setMainCash(mainRows);
        setCompanies(companyRows);
      } catch (error) {
        console.error('Failed to load balance sheet data:', error);
        setErrorMessage('Unable to load balance sheet data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [api, token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, asOfDate]);

  const getInvoiceDueBalance = (invoice: InvoiceRow): number => {
    const explicitDue = Number(invoice?.due_amount ?? invoice?.balance_amount ?? 0);
    if (explicitDue > 0) return explicitDue;

    const total = Number(invoice?.total ?? 0);
    const paid = Number(invoice?.paid_amount ?? 0);
    const derived = total - paid;
    return derived > 0 ? derived : 0;
  };

  const receivableRows = useMemo(() => {
    return invoices
      .filter((invoice) => {
        const date = String(invoice.invoice_date || '').slice(0, 10);
        const status = String(invoice.status || '').toLowerCase();
        return date <= asOfDate && status !== 'cancelled';
      })
      .map((invoice) => {
        const amount = getInvoiceDueBalance(invoice);
        const customer = String(invoice.customer?.shop_name || '').trim();
        const customerCode = String(invoice.customer?.customer_code || '').trim();

        return {
          id: `inv-${invoice.id}`,
          category: 'Asset' as const,
          item: 'Accounts Receivable',
          date: String(invoice.invoice_date || '').slice(0, 10) || '-',
          reference: String(invoice.invoice_number || `INV-${invoice.id}`),
          details: customer
            ? `${customer}${customerCode ? ` (${customerCode})` : ''}`
            : 'Customer not specified',
          amount,
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => {
        if (a.date === b.date) return b.reference.localeCompare(a.reference);
        return b.date.localeCompare(a.date);
      });
  }, [invoices, asOfDate]);

  const payableRows = useMemo(() => {
    return grns
      .filter((grn) => {
        const date = String(grn.received_date || '').slice(0, 10);
        const status = String(grn.status || '').toLowerCase();
        const timing = String(grn.payment_timing || 'post_payment').toLowerCase();
        return date <= asOfDate && status !== 'cancelled' && timing === 'post_payment';
      })
      .map((grn) => {
        const net = Number(grn.net_amount || 0);
        const paid = Number(grn.paid_amount || 0);
        const amount = net - paid;
        const supplierName = String(grn.purchase_order?.supplier?.name || '').trim();

        return {
          id: `grn-${grn.id}`,
          category: 'Liability' as const,
          item: 'Accounts Payable',
          date: String(grn.received_date || '').slice(0, 10) || '-',
          reference: String(grn.grn_number || `GRN-${grn.id}`),
          details: supplierName || 'Supplier not specified',
          amount,
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => {
        if (a.date === b.date) return b.reference.localeCompare(a.reference);
        return b.date.localeCompare(a.date);
      });
  }, [grns, asOfDate]);

  const pettyCashBalance = useMemo(
    () =>
      pettyCash
        .filter((row) => String(row.date || '').slice(0, 10) <= asOfDate)
        .reduce((sum, row) => {
          const amount = Number(row.amount || 0);
          if (row.type === 'in') return sum + amount;
          if (row.type === 'out') return sum - amount;
          return sum;
        }, 0),
    [pettyCash, asOfDate]
  );

  const deliveryCashBalance = useMemo(
    () =>
      deliveryCash
        .filter((row) => String(row.date || '').slice(0, 10) <= asOfDate)
        .reduce((sum, row) => {
          const amount = Number(row.amount || 0);
          if (row.type === 'in') return sum + amount;
          if (row.type === 'out') return sum - amount;
          return sum;
        }, 0),
    [deliveryCash, asOfDate]
  );

  const mainCashBalance = useMemo(
    () =>
      mainCash
        .filter((row) => String(row.date || '').slice(0, 10) <= asOfDate)
        .reduce((sum, row) => {
          const amount = Number(row.amount || 0);
          if (row.type === 'in') return sum + amount;
          if (row.type === 'out') return sum - amount;
          return sum;
        }, 0),
    [mainCash, asOfDate]
  );

  const companyBalanceSnapshot = useMemo(() => {
    const totals = companies.reduce(
      (acc, company) => {
        acc.cash += Number(company.current_cash_balance || 0);
        acc.bank += Number(company.current_bank_balance || 0);
        acc.cheque += Number(company.current_cheque_balance || 0);
        return acc;
      },
      { cash: 0, bank: 0, cheque: 0 }
    );

    return totals;
  }, [companies]);

  const cashRows = useMemo<DetailRow[]>(
    () => [
      {
        id: 'cash-main',
        category: 'Asset',
        item: 'Cash Ledger - Main',
        date: asOfDate,
        reference: 'MAIN-CASH',
        details: 'Calculated from main cash transactions (in - out)',
        amount: mainCashBalance,
      },
      {
        id: 'cash-petty',
        category: 'Asset',
        item: 'Cash Ledger - Petty',
        date: asOfDate,
        reference: 'PETTY-CASH',
        details: 'Calculated from petty cash transactions (in - out)',
        amount: pettyCashBalance,
      },
      {
        id: 'cash-delivery',
        category: 'Asset',
        item: 'Cash Ledger - Delivery',
        date: asOfDate,
        reference: 'DELIVERY-CASH',
        details: 'Calculated from delivery cash transactions (in - out)',
        amount: deliveryCashBalance,
      },
    ],
    [asOfDate, mainCashBalance, pettyCashBalance, deliveryCashBalance]
  );

  const assetsTotal = cashRows.reduce((sum, row) => sum + row.amount, 0) + receivableRows.reduce((sum, row) => sum + row.amount, 0);
  const liabilitiesTotal = payableRows.reduce((sum, row) => sum + row.amount, 0);
  const ownerEquity = assetsTotal - liabilitiesTotal;

  const detailRows = useMemo(() => {
    const rows: DetailRow[] = [...cashRows, ...receivableRows, ...payableRows];

    return rows.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.date === b.date) return b.reference.localeCompare(a.reference);
      return b.date.localeCompare(a.date);
    });
  }, [cashRows, receivableRows, payableRows]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return detailRows.filter((row) => {
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'cash' && row.item.toLowerCase().includes('cash ledger')) ||
        (typeFilter === 'receivables' && row.item === 'Accounts Receivable') ||
        (typeFilter === 'payables' && row.item === 'Accounts Payable');

      if (!matchesType) return false;
      if (!term) return true;

      return (
        row.category.toLowerCase().includes(term) ||
        row.item.toLowerCase().includes(term) ||
        row.date.toLowerCase().includes(term) ||
        row.reference.toLowerCase().includes(term) ||
        row.details.toLowerCase().includes(term)
      );
    });
  }, [detailRows, typeFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const rowToExport = (row: DetailRow) => [
    row.category,
    row.item,
    row.date,
    row.reference,
    row.details,
    Number(row.amount || 0).toFixed(2),
  ];

  const exportCsv = () => {
    const headers = ['Category', 'Item', 'Date', 'Reference', 'Details', 'Amount'];
    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `balance-sheet-report-${asOfDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Accounting Balance Sheet', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`As Of Date: ${asOfDate}`, 40, 72);
    doc.text(`Filter: ${typeFilter.toUpperCase()}`, 40, 86);
    doc.text(`Search: ${searchTerm.trim() || 'N/A'}`, 40, 100);

    autoTable(doc, {
      startY: 114,
      head: [['Category', 'Item', 'Date', 'Reference', 'Details', 'Amount']],
      body: filteredRows.map((row) => rowToExport(row)),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Assets: ${money(assetsTotal)} | Liabilities: ${money(liabilitiesTotal)} | Equity: ${money(ownerEquity)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    doc.save(`balance-sheet-report-${asOfDate}.pdf`);
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50">
        <div className="rounded-2xl border border-blue-100 bg-white/85 px-6 py-5 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Preparing Balance Sheet</p>
              <p className="text-xs text-slate-500">Loading accounting ledgers and balances...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-35">
        <div className="absolute -top-16 -left-14 h-72 w-72 rounded-full bg-blue-300 blur-3xl" />
        <div className="absolute top-24 right-0 h-80 w-80 rounded-full bg-cyan-300 blur-3xl" />
        <div className="absolute -bottom-12 left-1/3 h-72 w-72 rounded-full bg-sky-300 blur-3xl" />
      </div>

      <nav className="bg-white/82 backdrop-blur-lg shadow border-b border-white/50 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard/reports" className="text-sm font-semibold text-slate-700 hover:text-blue-700 transition-colors">← Back to Reports</Link>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide uppercase text-blue-700">Accounting</span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6 relative z-10">
        <section className="rounded-3xl border border-white/70 bg-white/80 backdrop-blur-lg p-6 md:p-7 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">Balance Sheet</p>
              <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Assets, Liabilities & Equity</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-2xl">
                View the accounting position as of a selected date using receivables, payables, and net cash ledger balances.
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 px-4 py-3 min-w-[250px]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">As of Date</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{asOfDate}</p>
              <p className="mt-1 text-xs text-slate-600">A = L + E : {money(assetsTotal)} = {money(liabilitiesTotal)} + {money(ownerEquity)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2 lg:col-span-1">
              As of date
              <input
                type="date"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none"
              />
            </label>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Detail Type</label>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'all' | 'cash' | 'receivables' | 'payables')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">All</option>
                <option value="cash">Cash Ledgers</option>
                <option value="receivables">Receivables</option>
                <option value="payables">Payables</option>
              </select>
            </div>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Search
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by item, reference, party, or category"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none"
              />
            </label>
          </div>
          {errorMessage && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Total Assets</p>
            <p className="mt-2 text-3xl font-black text-emerald-900">{money(assetsTotal)}</p>
            <p className="mt-2 text-xs text-emerald-700">Cash ledgers + accounts receivable</p>
          </article>
          <article className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Total Liabilities</p>
            <p className="mt-2 text-3xl font-black text-rose-900">{money(liabilitiesTotal)}</p>
            <p className="mt-2 text-xs text-rose-700">Outstanding supplier payables</p>
          </article>
          <article className={`rounded-2xl border p-5 shadow-lg ${ownerEquity >= 0 ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-white' : 'border-orange-200 bg-gradient-to-br from-orange-50 to-white'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Owner Equity</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{money(Math.abs(ownerEquity))}</p>
            <p className="mt-2 text-xs text-slate-600">{ownerEquity >= 0 ? 'Positive equity' : 'Negative equity'}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50">
            <h2 className="font-semibold text-slate-900">Balance Components</h2>
            <p className="text-xs text-slate-600 mt-0.5">Cash ledgers are computed from transactions up to the selected date.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 sm:p-5 bg-white/80 border-b border-gray-100">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Cash Ledger Snapshot</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><span>Main Cash</span><span className="font-semibold text-slate-900">{money(mainCashBalance)}</span></div>
                <div className="flex items-center justify-between"><span>Petty Cash</span><span className="font-semibold text-slate-900">{money(pettyCashBalance)}</span></div>
                <div className="flex items-center justify-between"><span>Delivery Cash</span><span className="font-semibold text-slate-900">{money(deliveryCashBalance)}</span></div>
                <div className="pt-1 mt-1 border-t border-slate-200 flex items-center justify-between font-bold text-slate-900"><span>Total Cash Ledgers</span><span>{money(cashRows.reduce((sum, row) => sum + row.amount, 0))}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Company Balance Snapshot</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><span>Current Cash Balance</span><span className="font-semibold text-slate-900">{money(companyBalanceSnapshot.cash)}</span></div>
                <div className="flex items-center justify-between"><span>Current Bank Balance</span><span className="font-semibold text-slate-900">{money(companyBalanceSnapshot.bank)}</span></div>
                <div className="flex items-center justify-between"><span>Current Cheque Balance</span><span className="font-semibold text-slate-900">{money(companyBalanceSnapshot.cheque)}</span></div>
                <div className="pt-1 mt-1 border-t border-slate-200 flex items-center justify-between font-bold text-slate-900"><span>Total Company Snapshot</span><span>{money(companyBalanceSnapshot.cash + companyBalanceSnapshot.bank + companyBalanceSnapshot.cheque)}</span></div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-gray-100 bg-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">Showing {filteredRows.length} detail row(s)</p>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Download CSV</button>
                <button type="button" onClick={downloadPdf} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100">Download PDF</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Category</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Item</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Date</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Reference</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Details</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      No records found for current filters.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, index) => (
                    <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${row.category === 'Asset' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'}`}>
                          {row.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700 font-medium">{row.item}</td>
                      <td className="px-5 py-3 text-slate-700">{row.date || '-'}</td>
                      <td className="px-5 py-3 text-slate-700">{row.reference || '-'}</td>
                      <td className="px-5 py-3 text-slate-700">{row.details || '-'}</td>
                      <td className={`px-5 py-3 text-right font-bold ${row.category === 'Asset' ? 'text-emerald-700' : 'text-rose-700'}`}>
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
                  return `Showing ${start}-${end} of ${filteredRows.length} rows`;
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
