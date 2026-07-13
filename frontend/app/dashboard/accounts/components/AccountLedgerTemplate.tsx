'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../../lib/apiClient';

type LedgerEntry = {
  id: string | number;
  date: string;
  created_at?: string;
  type: 'in' | 'out';
  amount: number;
  note: string;
  reference: string;
};

type LedgerTemplateProps = {
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  gradient: string;
  storageKey: string;
  showAccountingColumns?: boolean;
  enablePagination?: boolean;
  tablePageSize?: number;
  inTypeLabel?: string;
  outTypeLabel?: string;
  apiEndpoint?: string;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value?: string) => {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export default function AccountLedgerTemplate({
  title,
  subtitle,
  icon,
  accent,
  gradient,
  storageKey,
  showAccountingColumns = false,
  enablePagination = false,
  tablePageSize = 10,
  inTypeLabel = 'Cash In',
  outTypeLabel = 'Cash Out',
  apiEndpoint,
}: LedgerTemplateProps) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'in' as 'in' | 'out',
    amount: '',
    reference: '',
    note: '',
  });

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

    const loadEntries = async () => {
      if (!apiEndpoint) {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
          setEntries([]);
          setLoading(false);
          return;
        }

        try {
          const parsed = JSON.parse(raw);
          setEntries(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
          console.error(`Failed to parse ${storageKey}:`, error);
          setEntries([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const res = await api.get(apiEndpoint, { params: { per_page: 500 } });
        const payload = res.data;
        const data = Array.isArray(payload)
          ? payload
          : (payload?.data?.data || payload?.data || []);
        setEntries(Array.isArray(data) ? data : []);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }

        console.error(`Failed to load entries from ${apiEndpoint}:`, error);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [token, storageKey, apiEndpoint, api, router]);

  const persistEntries = (nextEntries: LedgerEntry[]) => {
    setEntries(nextEntries);
    localStorage.setItem(storageKey, JSON.stringify(nextEntries));
  };

  const addEntry = async () => {
    setFormError('');
    const amount = Number(form.amount);
    if (!form.date || Number.isNaN(amount) || amount <= 0) return;

    if (form.type === 'out' && amount > totals.balance) {
      setFormError('Insufficient balance. Expense amount is higher than current balance.');
      return;
    }

    const next: LedgerEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: form.date,
      type: form.type,
      amount,
      note: form.note.trim(),
      reference: form.reference.trim(),
    };

    if (apiEndpoint) {
      try {
        setSaving(true);
        const res = await api.post(apiEndpoint, {
          date: next.date,
          type: next.type,
          amount: next.amount,
          reference: next.reference || null,
          note: next.note || null,
        });

        const created = res.data?.data || res.data;
        if (created) {
          setEntries((prev) => [created, ...prev]);
        }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }

        const apiMessage =
          (isAxiosError(error) && (error.response?.data?.message as string)) ||
          'Failed to save transaction.';
        setFormError(apiMessage);
        return;
      } finally {
        setSaving(false);
      }
    } else {
      const nextEntries = [next, ...entries];
      persistEntries(nextEntries);
    }

    setForm({
      date: new Date().toISOString().split('T')[0],
      type: 'in',
      amount: '',
      reference: '',
      note: '',
    });
  };

  const removeEntry = async (id: string | number) => {
    if (apiEndpoint) {
      try {
        setSaving(true);
        await api.delete(`${apiEndpoint}/${id}`);
        setEntries((prev) => prev.filter((entry) => entry.id !== id));
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }

        const apiMessage =
          (isAxiosError(error) && (error.response?.data?.message as string)) ||
          'Failed to delete transaction.';
        setFormError(apiMessage);
      } finally {
        setSaving(false);
      }
      return;
    }

    const nextEntries = entries.filter((entry) => entry.id !== id);
    persistEntries(nextEntries);
  };

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filterType !== 'all' && entry.type !== filterType) return false;
      if (!term) return true;

      const haystack = [entry.reference, entry.note, entry.date, entry.type].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [entries, filterType, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterType, entries.length]);

  const totalPages = useMemo(() => {
    if (!enablePagination) return 1;
    return Math.max(1, Math.ceil(filteredEntries.length / tablePageSize));
  }, [enablePagination, filteredEntries.length, tablePageSize]);

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEntries = useMemo(() => {
    if (!enablePagination) return filteredEntries;
    const start = (safeCurrentPage - 1) * tablePageSize;
    return filteredEntries.slice(start, start + tablePageSize);
  }, [enablePagination, filteredEntries, safeCurrentPage, tablePageSize]);

  const pageStart = filteredEntries.length === 0 ? 0 : ((safeCurrentPage - 1) * tablePageSize) + 1;
  const pageEnd = enablePagination
    ? Math.min(safeCurrentPage * tablePageSize, filteredEntries.length)
    : filteredEntries.length;

  const totals = useMemo(() => {
    const inflow = entries
      .filter((entry) => entry.type === 'in')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    const outflow = entries
      .filter((entry) => entry.type === 'out')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      inflow,
      outflow,
      balance: inflow - outflow,
    };
  }, [entries]);

  const balanceByEntryId = useMemo(() => {
    const map: Record<string, number> = {};
    const chronological = [...entries].reverse();
    let runningBalance = 0;

    chronological.forEach((entry) => {
      const amount = Number(entry.amount || 0);
      runningBalance += entry.type === 'in' ? amount : -amount;
      map[entry.id] = runningBalance;
    });

    return map;
  }, [entries]);

  if (!token || loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${accent}`}></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${gradient}`}>
      <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard/accounts" className="flex items-center space-x-2 text-gray-700 hover:text-teal-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Accounts</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className={`w-2 h-2 rounded-full animate-pulse ${accent.replace('text-', 'bg-')}`}></div>
              <span>Ledger Active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center">
          <div className="inline-block p-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full mb-4">
            <div className="bg-white rounded-full p-4 text-4xl">{icon}</div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 p-5 shadow">
            <p className="text-xs text-gray-500 uppercase">Total In</p>
            <p className="text-2xl font-bold text-emerald-700">{money(totals.inflow)}</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 p-5 shadow">
            <p className="text-xs text-gray-500 uppercase">Total Out</p>
            <p className="text-2xl font-bold text-rose-700">{money(totals.outflow)}</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 p-5 shadow">
            <p className="text-xs text-gray-500 uppercase">Current Balance</p>
            <p className={`text-2xl font-bold ${totals.balance >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>{money(totals.balance)}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Entry</h2>
          {formError ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            />
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as 'in' | 'out' }))}
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            >
              <option value="in">{inTypeLabel}</option>
              <option value="out">{outTypeLabel}</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            />
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            />
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Note"
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            />
            <button
              type="button"
              onClick={addEntry}
              disabled={saving}
              className="rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold px-4 py-2 hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Add Entry'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, refs"
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'in' | 'out')}
              className="rounded-md border border-gray-300 text-sm text-black px-3 py-2"
            >
              <option value="all">All Types</option>
              <option value="in">{inTypeLabel}</option>
              <option value="out">{outTypeLabel}</option>
            </select>
            <div className="text-sm text-gray-600 flex items-center md:justify-end">
              Entries: <span className="font-semibold ml-1">{filteredEntries.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Note</th>
                  {showAccountingColumns ? (
                    <>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Credit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Balance</th>
                    </>
                  ) : (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={showAccountingColumns ? 8 : 6} className="px-4 py-10 text-center text-sm text-gray-500">No ledger entries yet.</td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry, idx) => (
                    <tr key={entry.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(entry.created_at || entry.date)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${entry.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {entry.type === 'in' ? inTypeLabel : outTypeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.reference || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.note || '-'}</td>
                      {showAccountingColumns ? (
                        <>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700">
                            {entry.type === 'in' ? money(entry.amount) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-rose-700">
                            {entry.type === 'out' ? money(entry.amount) : '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold ${(balanceByEntryId[entry.id] || 0) >= 0 ? 'text-cyan-700' : 'text-rose-700'}`}>
                            {money(balanceByEntryId[entry.id] || 0)}
                          </td>
                        </>
                      ) : (
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${entry.type === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {entry.type === 'in' ? '+' : '-'} {money(entry.amount)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          disabled={saving}
                          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {enablePagination ? (
            <div className="flex flex-col gap-3 border-t border-gray-100 bg-white/80 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {pageStart}-{pageEnd} of {filteredEntries.length} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage === 1 || filteredEntries.length === 0}
                  className="rounded-full border border-gray-300 px-4 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage === totalPages || filteredEntries.length === 0}
                  className="rounded-full border border-gray-300 px-4 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
