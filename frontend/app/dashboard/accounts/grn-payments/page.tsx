'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApiClient } from '../../../../lib/apiClient';
import { isAxiosError } from '@/lib/http';

interface Supplier {
  id: number;
  name: string;
  outstanding_balance?: number;
}

interface PurchaseOrder {
  id: number;
  order_number: string;
  supplier: Supplier;
}

interface CompanyBankAccountOption {
  id: number;
  company_name: string;
  bank_name: string;
  account_no: string;
  current_balance: number;
}

interface GrnPaymentRecord {
  id: number;
  grn_number: string;
  received_date: string;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  paid_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_timing?: 'post_payment' | 'on_time';
  payment_type?: string | null;
  payment_reference?: string | null;
  payment_note?: string | null;
  paid_at?: string | null;
  purchase_order: PurchaseOrder;
  created_at: string;
}

export default function GrnPaymentsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<GrnPaymentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [selectedGrn, setSelectedGrn] = useState<GrnPaymentRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState<'cash' | 'bank_transfer' | 'bank_deposit' | 'cheque' | 'party_cheque' | 'card'>('cash');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payBankName, setPayBankName] = useState('');
  const [payChequeNumber, setPayChequeNumber] = useState('');
  const [payChequeDate, setPayChequeDate] = useState('');
  const [payNote, setPayNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccountOption[]>([]);

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  const money = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fetchGrnRecords = async () => {
    try {
      const res = await api.get('/purchasing/grn');
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      const parsed = ((Array.isArray(rows) ? rows : []) as GrnPaymentRecord[])
        .filter((row) => (row.payment_timing || 'post_payment') === 'post_payment');
      parsed.sort((a, b) => {
        const dateA = new Date(a.created_at || a.received_date).getTime();
        const dateB = new Date(b.created_at || b.received_date).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return b.id - a.id;
      });
      setRecords(parsed);
    } catch (error) {
      console.error('Failed to fetch GRN payment records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyBankAccounts = async () => {
    try {
      const res = await api.get('/companies');
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      const normalized = (Array.isArray(rows) ? rows : []).flatMap((company: any) => {
        const companyName = String(company?.name || 'Company');
        const accounts = Array.isArray(company?.bank_accounts)
          ? company.bank_accounts
          : (Array.isArray(company?.bankAccounts) ? company.bankAccounts : []);

        return accounts.map((account: any) => ({
          id: Number(account?.id || 0),
          company_name: companyName,
          bank_name: String(account?.bank_name || ''),
          account_no: String(account?.account_no || ''),
          current_balance: Number(account?.current_balance || 0),
        }));
      }).filter((account: CompanyBankAccountOption) => account.id > 0);

      setBankAccounts(normalized);
    } catch (error) {
      console.error('Failed to fetch company bank accounts:', error);
      setBankAccounts([]);
    }
  };

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
    fetchGrnRecords();
    fetchCompanyBankAccounts();
  }, [token]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((row) => {
      const matchesStatus = statusFilter === 'all' || row.payment_status === statusFilter;
      const matchesSearch =
        !term ||
        [row.grn_number, row.purchase_order?.order_number, row.purchase_order?.supplier?.name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));

      return matchesStatus && matchesSearch;
    });
  }, [records, search, statusFilter]);

  const payableTotal = useMemo(() => {
    return filteredRecords.reduce((sum, row) => {
      const balance = Number(row.net_amount || 0) - Number(row.paid_amount || 0);
      return sum + Math.max(balance, 0);
    }, 0);
  }, [filteredRecords]);

  const openPaymentModal = (row: GrnPaymentRecord) => {
    setSelectedGrn(row);
    setPayAmount('');
    setPayType('cash');
    setPayBankAccountId('');
    setPayReference('');
    setPayBankName('');
    setPayChequeNumber('');
    setPayChequeDate('');
    setPayNote('');
    setErrorMessage('');
  };

  const closePaymentModal = () => {
    setSelectedGrn(null);
    setPayAmount('');
    setPayType('cash');
    setPayBankAccountId('');
    setPayReference('');
    setPayBankName('');
    setPayChequeNumber('');
    setPayChequeDate('');
    setPayNote('');
    setErrorMessage('');
  };

  const submitPayment = async () => {
    if (!selectedGrn) return;

    const amount = Number(payAmount || 0);
    const balance = Number(selectedGrn.net_amount || 0) - Number(selectedGrn.paid_amount || 0);

    if (amount <= 0) {
      setErrorMessage('Enter a valid payment amount.');
      return;
    }

    if (amount > balance) {
      setErrorMessage('Payment amount cannot exceed GRN balance.');
      return;
    }

    if (payType === 'cheque' || payType === 'party_cheque') {
      if (!payBankName.trim() || !payChequeNumber.trim() || !payChequeDate) {
        setErrorMessage('For cheque payment, bank name, cheque number, and cheque date are required.');
        return;
      }
    }

    if (payType === 'bank_transfer' || payType === 'bank_deposit') {
      const selectedAccount = bankAccounts.find((account) => account.id === Number(payBankAccountId || 0));
      if (!selectedAccount || !payReference.trim()) {
        setErrorMessage('For bank transfer/deposit, select company bank account and reference.');
        return;
      }
      if (Number(selectedAccount.current_balance || 0) < amount) {
        setErrorMessage('Selected bank account does not have enough available balance.');
        return;
      }
    }

    try {
      setSubmitting(true);
      setErrorMessage('');
      await api.post(`/purchasing/grn/${selectedGrn.id}/payment`, {
        paid_amount: amount,
        payment_type: payType,
        payment_reference: payReference.trim() || null,
        bank_account_id: payType === 'bank_transfer' || payType === 'bank_deposit' ? Number(payBankAccountId || 0) : null,
        bank_name: payBankName.trim() || null,
        cheque_number: payChequeNumber.trim() || null,
        cheque_date: payChequeDate || null,
        payment_note: payNote || null,
      });
      closePaymentModal();
      fetchGrnRecords();
    } catch (error) {
      if (isAxiosError(error)) {
        const firstError = Object.values(error.response?.data?.errors || {})?.[0] as string[] | undefined;
        setErrorMessage(firstError?.[0] || error.response?.data?.message || 'Failed to record payment.');
      } else {
        setErrorMessage('Failed to record payment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="rounded-3xl border border-white/70 bg-white/90 shadow-xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">Accounts</p>
              <h1 className="text-3xl font-bold text-slate-900">GRN Payment Control</h1>
              <p className="mt-2 text-sm text-slate-600">Review GRN financials and settle supplier payments with clear audit notes.</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard/purchasing/grn"
                className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100"
              >
                Review GRN Details
              </Link>
              <Link
                href="/dashboard/accounts"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Accounts
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">Open Payable</p>
            <p className="mt-2 text-2xl font-bold text-rose-800">LKR {money(payableTotal)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Unpaid GRNs</p>
            <p className="mt-2 text-2xl font-bold text-amber-800">{records.filter((r) => r.payment_status === 'unpaid').length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Paid GRNs</p>
            <p className="mt-2 text-2xl font-bold text-emerald-800">{records.filter((r) => r.payment_status === 'paid').length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 p-4 grid gap-3 md:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GRN #, PO #, supplier"
              className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'unpaid' | 'partial' | 'paid')}
              className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            <div className="text-sm text-slate-600 flex items-center md:justify-end">
              {filteredRecords.length} records
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">GRN #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Discount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Net</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">No GRN payment records found.</td>
                  </tr>
                ) : (
                  filteredRecords.map((row) => {
                    const balance = Math.max(Number(row.net_amount || 0) - Number(row.paid_amount || 0), 0);
                    return (
                      <tr key={row.id} className="hover:bg-cyan-50/35 transition">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.grn_number}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.purchase_order?.supplier?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{new Date(row.received_date).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{money(Number(row.total_amount || 0))}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{money(Number(row.discount_amount || 0))}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{money(Number(row.net_amount || 0))}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{money(Number(row.paid_amount || 0))}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-rose-700">{money(balance)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              row.payment_status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700'
                                : row.payment_status === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {row.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openPaymentModal(row)}
                            disabled={balance <= 0}
                            className="inline-flex rounded-full bg-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">Record GRN Payment</h3>
            <p className="mt-1 text-sm text-slate-600">
              {selectedGrn.grn_number} • Balance LKR {money(Math.max(Number(selectedGrn.net_amount || 0) - Number(selectedGrn.paid_amount || 0), 0))}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Amount</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Type</label>
                <select
                  value={payType}
                  onChange={(e) => setPayType(e.target.value as 'cash' | 'bank_transfer' | 'bank_deposit' | 'cheque' | 'party_cheque' | 'card')}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="bank_deposit">Bank Deposit</option>
                  <option value="cheque">Cheque</option>
                  <option value="party_cheque">Party Cheque</option>
                  <option value="card">Card</option>
                </select>
              </div>

              {(payType === 'cheque' || payType === 'party_cheque') && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Bank</label>
                  <input
                    type="text"
                    value={payBankName}
                    onChange={(e) => setPayBankName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                    placeholder="Bank name"
                  />
                </div>
              )}

              {(payType === 'bank_transfer' || payType === 'bank_deposit') && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Company Bank Account</label>
                  <select
                    value={payBankAccountId}
                    onChange={(e) => setPayBankAccountId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                  >
                    <option value="">Select account</option>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.company_name} - {account.bank_name} ({account.account_no}) | Available: LKR {money(account.current_balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(payType === 'cheque' || payType === 'party_cheque') && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Cheque Number</label>
                    <input
                      type="text"
                      value={payChequeNumber}
                      onChange={(e) => setPayChequeNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                      placeholder="Cheque #"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Cheque Date</label>
                    <input
                      type="date"
                      value={payChequeDate}
                      onChange={(e) => setPayChequeDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                    />
                  </div>
                </>
              )}

              {(payType === 'bank_transfer' || payType === 'bank_deposit' || payType === 'card') && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Reference</label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                    placeholder="Transaction reference"
                  />
                </div>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Supplier Outstanding Impact</p>
                <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-amber-900">
                  <p>
                    Current Outstanding: <span className="font-semibold">LKR {money(Number(selectedGrn.purchase_order?.supplier?.outstanding_balance || 0))}</span>
                  </p>
                  <p>
                    Outstanding After This Payment: <span className="font-semibold">LKR {money(Math.max(Number(selectedGrn.purchase_order?.supplier?.outstanding_balance || 0) - Number(payAmount || 0), 0))}</span>
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Note</label>
                <textarea
                  rows={3}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                  placeholder="Optional payment remarks"
                />
              </div>
              {errorMessage && <p className="text-sm font-medium text-rose-600">{errorMessage}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closePaymentModal}
                className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitPayment}
                disabled={submitting}
                className="rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
