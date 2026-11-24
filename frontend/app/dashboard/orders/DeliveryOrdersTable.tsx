'use client';

import { useEffect, useState } from 'react';
import axios from '@/lib/http';

type DoListItem = {
  id: number;
  quantity?: number | string | null;
};

type DoListRow = {
  id: number;
  do_number: string;
  do_date?: string | null;
  delivery_date?: string | null;
  due_date?: string | null;
  load_id?: number | null;
  call_confirmed?: boolean | number | null;
  total?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  customer?: { shop_name?: string | null; customer_code?: string | null } | null;
  items?: DoListItem[];
};

type PageMeta = { current_page: number; last_page: number; total: number; from: number | null; to: number | null };

type Props = {
  token: string;
  apiUrl: string;
  /** Increment to reload the list (e.g. after a DO is created). */
  refreshKey: number;
  onView: (doId: number) => void;
};

const PAGE_SIZE = 10;

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => num(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return '-';
  const [, y, m, d] = match;
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${d} ${month} ${y}`;
};

const STATUS_TONE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  pending: 'bg-sky-100 text-sky-700',
};

export default function DeliveryOrdersTable({ token, apiUrl, refreshKey, onView }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; rows: DoListRow[]; meta: PageMeta | null; error: string } | null>(null);

  // Debounce typing so the server isn't queried on every key press.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const requestKey = `${search}|${page}|${refreshKey}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    if (!token) return;
    let active = true;
    axios
      .get(`${apiUrl}/api/distribution/dos`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: PAGE_SIZE, page, ...(search ? { q: search } : {}) },
      })
      .then((res) => {
        if (!active) return;
        const payload = res.data?.data || {};
        setResult({
          key: requestKey,
          rows: Array.isArray(payload.data) ? payload.data : [],
          meta: {
            current_page: num(payload.current_page) || 1,
            last_page: num(payload.last_page) || 1,
            total: num(payload.total),
            from: payload.from ?? null,
            to: payload.to ?? null,
          },
          error: '',
        });
      })
      .catch(() => {
        if (active) setResult({ key: requestKey, rows: [], meta: null, error: 'Could not load delivery orders.' });
      });
    return () => { active = false; };
  }, [apiUrl, page, requestKey, search, token]);

  const rows = result?.rows || [];
  const meta = result?.meta;
  const lastPage = meta?.last_page || 1;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-xl backdrop-blur-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-blue-50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">Delivery Orders</div>
          <p className="text-xs text-gray-500">DOs created from orders. Open one to view or print it (54mm, 80mm or A4).</p>
        </div>
        <div className="relative w-full sm:w-72">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search DO no, customer or code"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium uppercase text-gray-500">
              <th className="px-4 py-2.5">DO #</th>
              <th className="px-4 py-2.5">DO date</th>
              <th className="px-4 py-2.5">Delivery</th>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Stock from</th>
              <th className="px-4 py-2.5 text-right">Items</th>
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5">Payment</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <tr key={`do-skeleton-${index}`}>
                  {Array.from({ length: 9 }, (__, cell) => (
                    <td key={cell} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-slate-200" /></td>
                  ))}
                </tr>
              ))
            ) : result?.error ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-rose-600">{result.error}</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                  {search ? `No delivery orders match “${search}”.` : 'No delivery orders yet. Create one from an order above.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const items = row.items || [];
                const qty = items.reduce((sum, item) => sum + num(item.quantity), 0);
                const status = String(row.status || 'pending').toLowerCase();
                return (
                  <tr key={row.id} className="transition-colors hover:bg-blue-50/40">
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">{row.do_number}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700">{formatDate(row.do_date)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700">{formatDate(row.delivery_date || row.due_date)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700">
                      <div className="font-medium text-gray-900">{row.customer?.shop_name || '-'}</div>
                      {row.customer?.customer_code ? <div className="text-xs text-gray-500">{row.customer.customer_code}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.load_id ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>
                        {row.load_id ? 'Vehicle load' : 'Factory store'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-700">
                      {items.length} <span className="text-xs text-gray-400">({qty.toFixed(2)} qty)</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{money(row.total)}</td>
                    <td className="px-4 py-2.5 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_TONE[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onView(row.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>
                        View / Print
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-4 py-3 text-sm">
          <div className="text-gray-600">Showing {meta.from ?? 0}-{meta.to ?? 0} of {meta.total}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || loading}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Previous
            </button>
            <span className="text-xs text-gray-600">Page {page} / {lastPage}</span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(lastPage, prev + 1))}
              disabled={page >= lastPage || loading}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
