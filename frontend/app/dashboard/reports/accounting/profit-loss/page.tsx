'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApiClient } from '@/lib/apiClient';

type InvoiceRow = {
  id: number;
  invoice_number?: string;
  invoice_date?: string;
  total?: number;
  status?: string;
};

type CashRow = {
  id: number | string;
  date?: string;
  type?: 'in' | 'out';
  amount?: number;
  reference?: string | null;
  note?: string | null;
};

type ExpenseRow = CashRow & { source: string };

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

export default function ProfitLossPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [fromDate, setFromDate] = useState(yearStart);
  const [toDate, setToDate] = useState(today);
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
        const [invoiceRows, pettyRows, deliveryRows, mainRows] = await Promise.all([
          fetchAll<InvoiceRow>('/distribution/invoices'),
          fetchAll<CashRow>('/petty-cash-transactions'),
          fetchAll<CashRow>('/delivery-cash-transactions'),
          fetchAll<CashRow>('/main-cash-transactions'),
        ]);

        setInvoices(invoiceRows);
        setExpenses([
          ...pettyRows.map((row) => ({ ...row, source: 'Petty Cash' })),
          ...deliveryRows.map((row) => ({ ...row, source: 'Delivery Cash' })),
          ...mainRows.map((row) => ({ ...row, source: 'Other Expenses' })),
        ]);
      } catch (error) {
        console.error('Failed to load profit and loss data:', error);
        setErrorMessage('Unable to load accounting data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [api, token]);

  const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
    const date = String(invoice.invoice_date || '').slice(0, 10);
    return date >= fromDate && date <= toDate && String(invoice.status || '').toLowerCase() !== 'cancelled';
  }), [invoices, fromDate, toDate]);

  const filteredExpenses = useMemo(() => expenses.filter((expense) => {
    const date = String(expense.date || '').slice(0, 10);
    return date >= fromDate && date <= toDate && expense.type === 'out';
  }), [expenses, fromDate, toDate]);

  const salesTotal = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const netProfit = salesTotal - expenseTotal;
  const margin = salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0;

  const expenseBySource = ['Petty Cash', 'Delivery Cash', 'Other Expenses'].map((source) => ({
    source,
    amount: filteredExpenses
      .filter((expense) => expense.source === source)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
  }));

  const totalExpenseSourceAmount = expenseBySource.reduce((sum, row) => sum + row.amount, 0);

  const expensesForView = useMemo(
    () => [...filteredExpenses].sort((first, second) => {
      const a = String(first.date || '');
      const b = String(second.date || '');
      if (a === b) return String(second.id).localeCompare(String(first.id));
      return b.localeCompare(a);
    }),
    [filteredExpenses]
  );

  const sourcePillClass = (source: string) => {
    if (source === 'Petty Cash') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (source === 'Delivery Cash') return 'bg-teal-100 text-teal-800 border-teal-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const selectedRange = `${fromDate || 'N/A'} to ${toDate || 'N/A'}`;

  if (!token || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="rounded-2xl border border-emerald-100 bg-white/85 px-6 py-5 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Preparing Profit &amp; Loss Report</p>
              <p className="text-xs text-slate-500">Loading sales and expense ledgers...</p>
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
          <Link href="/dashboard/reports" className="text-sm font-semibold text-slate-700 hover:text-emerald-700 transition-colors">← Back to Reports</Link>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide uppercase text-emerald-700">Accounting</span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6 relative z-10">
        <section className="rounded-3xl border border-white/70 bg-white/80 backdrop-blur-lg p-6 md:p-7 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">Profit &amp; Loss Report</p>
              <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-slate-900">Financial Performance Snapshot</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-2xl">
                Revenue is calculated from non-cancelled invoice sales, while expenses aggregate outgoing records from petty cash, delivery cash, and other cash expense ledgers.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 px-4 py-3 min-w-[220px]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Selected Range</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{selectedRange}</p>
              <p className="mt-1 text-xs text-slate-600">Margin: {margin.toFixed(2)}%</p>
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
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              To date
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Sales Revenue</p>
            <p className="mt-2 text-3xl font-black text-emerald-900">{money(salesTotal)}</p>
            <p className="mt-2 text-xs text-emerald-700">{filteredInvoices.length} invoice(s) included</p>
          </article>
          <article className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-lg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Operating Expenses</p>
            <p className="mt-2 text-3xl font-black text-rose-900">{money(expenseTotal)}</p>
            <p className="mt-2 text-xs text-rose-700">{filteredExpenses.length} transaction(s) included</p>
          </article>
          <article className={`rounded-2xl border p-5 shadow-lg ${netProfit >= 0 ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white' : 'border-orange-200 bg-gradient-to-br from-orange-50 to-white'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Net Result</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{money(Math.abs(netProfit))}</p>
            <p className="mt-2 text-xs text-slate-600">{netProfit >= 0 ? 'Profit' : 'Loss'} with {margin.toFixed(2)}% margin</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-cyan-50">
            <h2 className="font-semibold text-slate-900">Expense Breakdown by Source</h2>
            <p className="text-xs text-slate-600 mt-0.5">Understand where expense pressure is coming from.</p>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            {expenseBySource.map((row) => {
              const share = totalExpenseSourceAmount > 0 ? (row.amount / totalExpenseSourceAmount) * 100 : 0;
              return (
                <div key={row.source} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">{row.source}</p>
                    <p className="text-sm font-bold text-rose-700">{money(row.amount)}</p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400" style={{ width: `${Math.min(100, share)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{share.toFixed(2)}% of total expenses</p>
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Total Expenses</p>
              <p className="text-sm font-black text-slate-900">{money(expenseTotal)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-emerald-50">
            <h2 className="font-semibold text-slate-900">Expense Transactions</h2>
            <p className="text-xs text-slate-600 mt-0.5">Detailed outgoing entries across petty, delivery, and other expense ledgers.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Date</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Source</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-600 uppercase text-xs tracking-wide">Reference / Note</th>
                  <th className="px-5 py-3 text-right font-semibold text-slate-600 uppercase text-xs tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {expensesForView.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                      No expenses in this period.
                    </td>
                  </tr>
                ) : (
                  expensesForView.map((expense, index) => (
                    <tr key={`${expense.source}-${expense.id}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-5 py-3 text-slate-700">{expense.date || '-'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourcePillClass(expense.source)}`}>
                          {expense.source}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{expense.reference || expense.note || '-'}</td>
                      <td className="px-5 py-3 text-right font-bold text-rose-700">{money(Number(expense.amount || 0))}</td>
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
