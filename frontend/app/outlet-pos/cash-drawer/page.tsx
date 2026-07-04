'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type CashDrawer = {
  outlet_id: number;
  balance: number;
  last_set_at?: string | null;
  last_set_by?: number | null;
  note?: string | null;
};

type CashierSession = {
  session_date: string;
  is_open: boolean;
  is_closed: boolean;
  needs_open: boolean;
  opening_balance: number;
  opening_note?: string | null;
  opened_at?: string | null;
  closing_balance?: number | null;
  closing_note?: string | null;
  closed_at?: string | null;
  status?: string | null;
};

type BalanceSheet = {
  opening_balance: number;
  closing_balance: number;
  balance_difference: number;
  total_sales: number;
  total_sales_amount: number;
  session_date: string;
};

type TransactionRow = {
  session_date: string;
  status: string;
  opening_balance: number;
  closing_balance: number | null;
  difference: number | null;
  opened_at?: string | null;
  closed_at?: string | null;
  opening_note?: string | null;
  closing_note?: string | null;
  total_sales: number;
  total_sales_amount: number;
};

function OutletCashDrawerContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [outletName, setOutletName] = useState('Outlet');
  const [outletCode, setOutletCode] = useState('-');
  const [outletId, setOutletId] = useState<number | null>(null);
  const [cashDrawer, setCashDrawer] = useState<CashDrawer | null>(null);
  const [session, setSession] = useState<CashierSession | null>(null);
  const [sheet, setSheet] = useState<BalanceSheet | null>(null);
  const [sheetDate, setSheetDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [openingNote, setOpeningNote] = useState('');
  const [closingBalance, setClosingBalance] = useState('0.00');
  const [closingNote, setClosingNote] = useState('');

  const router = useRouter();
  const params = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';

  const getPathWithCode = (path: string) => {
    const outletCode = params.get('outlet_code') || '';
    return `${path}${outletCode ? `?outlet_code=${encodeURIComponent(outletCode)}` : ''}`;
  };

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos/cash-drawer'))}`);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos/cash-drawer'))}`);
      return;
    }

    setToken(storedToken);
  }, [router, params]);

  const loadData = async (authToken: string) => {
    const profileRes = await axios.get(`${API_URL}/api/outlet-pos/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      validateStatus: () => true,
    });

    if (profileRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (profileRes.status >= 400) {
      setMessage(profileRes.data?.message || 'Failed to load outlet profile.');
      return false;
    }

    const outlet = profileRes.data?.data?.outlet;
    if (!outlet) {
      redirectToLoginWithNext();
      return false;
    }

    const outletIdValue = Number(outlet.id) || null;
    setOutletName(outlet.name || 'Outlet');
    setOutletCode(outlet.code || '-');
    setOutletId(outletIdValue);

    const statusRes = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-status`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: outletIdValue ? { outlet_id: outletIdValue } : undefined,
      validateStatus: () => true,
    });

    if (statusRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (statusRes.status >= 400) {
      setMessage(statusRes.data?.message || 'Failed to load cashier status.');
      return false;
    }

    const drawer = statusRes.data?.data?.cash_drawer as CashDrawer | null;
    const sessionData = statusRes.data?.data?.session as CashierSession | null;

    setCashDrawer(drawer);
    setSession(sessionData);

    if (sessionData?.is_open) {
      setClosingBalance(Number(drawer?.balance || sessionData.opening_balance || 0).toFixed(2));
    } else {
      setOpeningBalance(Number(drawer?.balance || 0).toFixed(2));
    }

    const sheetRes = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-balance-sheet`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: outletIdValue ? { outlet_id: outletIdValue, session_date: sheetDate } : { session_date: sheetDate },
      validateStatus: () => true,
    });

    if (sheetRes.status < 400) {
      setSheet(sheetRes.data?.data || null);
    }

    return true;
  };

  const loadTransactionRecords = async (authToken: string, outletIdValue?: number | null) => {
    const safeOutletId = outletIdValue || outletId;
    if (!safeOutletId) return;

    try {
      setTransactionLoading(true);
      const res = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-transactions`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          outlet_id: safeOutletId,
          from_date: fromDate,
          to_date: toDate,
        },
        validateStatus: () => true,
      });

      if (res.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (res.status >= 400) {
        setTransactionRows([]);
        return;
      }

      setTransactionRows(Array.isArray(res.data?.data?.rows) ? res.data.data.rows : []);
    } catch (error) {
      console.error('Error loading transaction records:', error);
      setTransactionRows([]);
    } finally {
      setTransactionLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        setMessage('');
        await loadData(token);
        await loadTransactionRecords(token);
      } catch (error: any) {
        console.error('Error loading cash drawer page:', error);
        setMessage(error?.response?.data?.message || 'Failed to load cash drawer data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, API_URL, params, router, sheetDate]);

  const handleLoadTransactions = async () => {
    if (!token) return;
    await loadTransactionRecords(token);
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBalanceSheet = () => {
    const data = sheet;
    if (!data) {
      alert('No balance sheet data available.');
      return;
    }

    const rows: string[][] = [
      ['Outlet', `${outletName} (${outletCode})`],
      ['Session Date', data.session_date || sheetDate],
      ['Opening Balance', Number(data.opening_balance || 0).toFixed(2)],
      ['Closing Balance', Number(data.closing_balance || 0).toFixed(2)],
      ['Difference', Number(data.balance_difference || 0).toFixed(2)],
      ['Sales Count', String(Number(data.total_sales || 0))],
      ['Sales Amount', Number(data.total_sales_amount || 0).toFixed(2)],
    ];

    downloadCsv(`cash-drawer-balance-sheet-${data.session_date || sheetDate}.csv`, rows);
  };

  const handleDownloadTransactions = () => {
    if (transactionRows.length === 0) {
      alert('No transaction records available for selected date range.');
      return;
    }

    const header = [
      'Session Date',
      'Status',
      'Opening Balance',
      'Closing Balance',
      'Difference',
      'Total Sales',
      'Total Sales Amount',
      'Opened At',
      'Closed At',
      'Opening Note',
      'Closing Note',
    ];

    const rows = transactionRows.map((row) => [
      row.session_date || '',
      row.status || '',
      Number(row.opening_balance || 0).toFixed(2),
      row.closing_balance !== null ? Number(row.closing_balance || 0).toFixed(2) : '',
      row.difference !== null ? Number(row.difference || 0).toFixed(2) : '',
      String(Number(row.total_sales || 0)),
      Number(row.total_sales_amount || 0).toFixed(2),
      row.opened_at ? new Date(row.opened_at).toLocaleString() : '',
      row.closed_at ? new Date(row.closed_at).toLocaleString() : '',
      row.opening_note || '',
      row.closing_note || '',
    ]);

    downloadCsv(`cash-drawer-transactions-${fromDate}-to-${toDate}.csv`, [header, ...rows]);
  };

  const handleDownloadTransactionsPdf = () => {
    if (transactionRows.length === 0) {
      alert('No transaction records available for selected date range.');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const reportTitle = 'Cash Drawer Transaction Records';
    const outletLabel = `Outlet: ${outletName} (${outletCode})`;
    const dateRangeLabel = `Date Range: ${fromDate} to ${toDate}`;

    doc.setFontSize(14);
    doc.text(reportTitle, 40, 36);
    doc.setFontSize(10);
    doc.text(outletLabel, 40, 54);
    doc.text(dateRangeLabel, 40, 69);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 84);

    const head = [[
      'Session Date',
      'Status',
      'Opening Balance',
      'Closing Balance',
      'Difference',
      'Total Sales',
      'Sales Amount',
      'Opened At',
      'Closed At',
    ]];

    const body = transactionRows.map((row) => [
      row.session_date || '',
      row.status || '',
      Number(row.opening_balance || 0).toFixed(2),
      row.closing_balance !== null ? Number(row.closing_balance || 0).toFixed(2) : '-',
      row.difference !== null ? Number(row.difference || 0).toFixed(2) : '-',
      String(Number(row.total_sales || 0)),
      Number(row.total_sales_amount || 0).toFixed(2),
      row.opened_at ? new Date(row.opened_at).toLocaleString() : '-',
      row.closed_at ? new Date(row.closed_at).toLocaleString() : '-',
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 98,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      margin: { left: 24, right: 24 },
    });

    doc.save(`cash-drawer-transactions-${fromDate}-to-${toDate}.pdf`);
  };

  const handleOpenCashier = async () => {
    if (!token || !outletId) return;

    const amount = Number(openingBalance || 0);
    if (Number.isNaN(amount) || amount < 0) {
      alert('Please enter a valid opening balance.');
      return;
    }

    try {
      setSaving(true);
      const res = await axios.post(
        `${API_URL}/api/outlet-pos/cash-drawer-open`,
        {
          outlet_id: outletId,
          opening_balance: amount,
          opening_note: openingNote || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        }
      );

      if (res.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (res.status >= 400) {
        const apiMessage = res.data?.message || 'Failed to open cashier.';
        const errors = (res.data?.errors || {}) as Record<string, string[]>;
        const firstError = Object.values(errors)?.[0]?.[0];
        alert(firstError || apiMessage);
        return;
      }

      setMessage('Cashier opened successfully.');
      setOpeningNote('');
      await loadData(token);
    } catch (error: any) {
      console.error('Error opening cashier:', error);
      alert(error?.response?.data?.message || 'Failed to open cashier.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseCashier = async () => {
    if (!token || !outletId) return;

    const amount = Number(closingBalance || 0);
    if (Number.isNaN(amount) || amount < 0) {
      alert('Please enter a valid closing balance.');
      return;
    }

    try {
      setSaving(true);
      const res = await axios.post(
        `${API_URL}/api/outlet-pos/cash-drawer-close`,
        {
          outlet_id: outletId,
          closing_balance: amount,
          closing_note: closingNote || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        }
      );

      if (res.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (res.status >= 400) {
        const apiMessage = res.data?.message || 'Failed to close cashier.';
        const errors = (res.data?.errors || {}) as Record<string, string[]>;
        const firstError = Object.values(errors)?.[0]?.[0];
        alert(firstError || apiMessage);
        return;
      }

      setMessage('Cashier closed successfully. Logout is now allowed.');
      setClosingNote('');
      await loadData(token);
    } catch (error: any) {
      console.error('Error closing cashier:', error);
      alert(error?.response?.data?.message || 'Failed to close cashier.');
    } finally {
      setSaving(false);
    }
  };

  const cardInputClass = 'w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/30 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100';
  const cardLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
      </div>

      <main className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_26px_90px_-45px_rgba(13,148,136,0.48)] backdrop-blur-xl">
          <div className="grid gap-7 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                Cash drawer control center
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Cashier Open / Close</h1>
                <p className="mt-2 text-sm text-slate-600 sm:text-base">
                  {outletName} ({outletCode})
                </p>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Manage opening and closing balances, track daily differences, and monitor transaction sessions from one premium workspace.
                </p>
              </div>
              <div>
                <Link
                  href={getPathWithCode('/outlet-pos')}
                  className="inline-flex rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-200/60 transition hover:from-rose-600 hover:to-pink-600"
                >
                  Back To Dashboard
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-500 to-teal-500 p-5 text-white shadow-lg shadow-emerald-300/45">
                <p className="text-xs uppercase tracking-[0.24em] text-white/80">Drawer Balance</p>
                <p className="mt-2 text-3xl font-bold">{Number(cashDrawer?.balance || 0).toFixed(2)}</p>
              </div>
              <div className="rounded-3xl border border-cyan-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-600">Session Date</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{session?.session_date || '-'}</p>
              </div>
              <div className="rounded-3xl border border-blue-200 bg-white p-5 shadow-sm sm:col-span-3 lg:col-span-1">
                <p className="text-xs uppercase tracking-[0.24em] text-blue-600">Status</p>
                <p className={`mt-2 text-base font-semibold ${session?.is_open ? 'text-emerald-700' : session?.is_closed ? 'text-blue-700' : 'text-amber-700'}`}>
                  {session?.is_open ? 'OPEN' : session?.is_closed ? 'CLOSED' : 'NOT OPEN'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
        )}

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg p-5 shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] space-y-5">
          {!session?.is_open ? (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Open Cashier</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={cardLabelClass}>Opening Balance</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className={cardInputClass}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={cardLabelClass}>Opening Note</label>
                  <input
                    type="text"
                    value={openingNote}
                    onChange={(e) => setOpeningNote(e.target.value)}
                    className={cardInputClass}
                    placeholder="Morning opening note"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleOpenCashier}
                  disabled={saving || session?.is_closed}
                  className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : session?.is_closed ? 'Already Closed Today' : 'Open Cashier'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Close Cashier</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={cardLabelClass}>Closing Balance</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(e.target.value)}
                    className={cardInputClass}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={cardLabelClass}>Closing Note</label>
                  <input
                    type="text"
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
                    className={cardInputClass}
                    placeholder="End-of-day closing note"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseCashier}
                  disabled={saving}
                  className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Close Cashier'}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg p-5 shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)]">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Daily Balance Sheet</h2>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <label className={cardLabelClass}>Sheet Date</label>
              <input
                type="date"
                value={sheetDate}
                onChange={(e) => setSheetDate(e.target.value)}
                className={cardInputClass}
              />
            </div>
            <button
              type="button"
              onClick={handleDownloadBalanceSheet}
              className="rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700"
            >
              Download Balance Sheet
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Opening Amount</div>
              <div className="text-xl font-bold text-slate-900">{Number(sheet?.opening_balance || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Closing Amount</div>
              <div className="text-xl font-bold text-slate-900">{Number(sheet?.closing_balance || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Difference</div>
              <div className="text-xl font-bold text-slate-900">{Number(sheet?.balance_difference || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Sales Count</div>
              <div className="text-xl font-bold text-slate-900">{Number(sheet?.total_sales || 0)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Sales Amount</div>
              <div className="text-xl font-bold text-slate-900">{Number(sheet?.total_sales_amount || 0).toFixed(2)}</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg p-5 shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)]">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Transaction Records</h2>
              <p className="text-sm text-slate-600">Open/close sessions and sales summary within date range.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTransactions}
                className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadTransactionsPdf}
                className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700"
              >
                Download PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className={cardLabelClass}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={cardInputClass}
              />
            </div>
            <div>
              <label className={cardLabelClass}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={cardInputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleLoadTransactions}
                disabled={transactionLoading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
              >
                {transactionLoading ? 'Loading...' : 'Load Records'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100/80">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Opening</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Closing</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Diff</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sales</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sales Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {transactionRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">No transaction records found.</td>
                  </tr>
                ) : (
                  transactionRows.map((row) => (
                    <tr key={row.session_date} className="transition hover:bg-emerald-50/35">
                      <td className="px-4 py-2.5 text-sm text-slate-700">{row.session_date}</td>
                      <td className="px-4 py-2.5 text-sm uppercase text-slate-700">{row.status || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-700">{Number(row.opening_balance || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-700">{row.closing_balance !== null ? Number(row.closing_balance || 0).toFixed(2) : '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-700">{row.difference !== null ? Number(row.difference || 0).toFixed(2) : '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-700">{Number(row.total_sales || 0)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">{Number(row.total_sales_amount || 0).toFixed(2)}</td>
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

export default function OutletCashDrawerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      }
    >
      <OutletCashDrawerContent />
    </Suspense>
  );
}
