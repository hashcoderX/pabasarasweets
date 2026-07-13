'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../lib/apiClient';

interface CompanyAccountEntry {
  id: number;
  bank_name?: string;
  account_no?: string;
  current_balance?: number;
}

interface CompanyProfile {
  id: number;
  name: string;
  currency?: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: CompanyAccountEntry[];
  cheque_accounts?: CompanyAccountEntry[];
}

export default function AccountsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [companyBalancesLoading, setCompanyBalancesLoading] = useState(false);
  const [companyBalances, setCompanyBalances] = useState<CompanyProfile[]>([]);
  const [cashBookBalance, setCashBookBalance] = useState(0);
  const [pettyBalance, setPettyBalance] = useState(0);
  const [deliveryBalance, setDeliveryBalance] = useState(0);
  const [grnPayableBalance, setGrnPayableBalance] = useState(0);

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

  const calcBalanceFromRows = (rows: any[]) => {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, row) => {
      const amount = Number(row?.amount || 0);
      const type = String(row?.type || '');
      return type === 'in' ? sum + amount : sum - amount;
    }, 0);
  };

  const fetchLedgerBalance = async (endpoint: string) => {
    try {
      const res = await api.get(endpoint, { params: { per_page: 500 } });
      const payload = res.data;
      const rows = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);
      return calcBalanceFromRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(`Failed to load ${endpoint}:`, error);
      return 0;
    }
  };

  useEffect(() => {
    if (!token) return;

    const loadAccountsDashboard = async () => {
      try {
        setCompanyBalancesLoading(true);
        const [mainCashBalance, pettyCashBalance, deliveryCashBalance, grnRes, companiesRes] = await Promise.all([
          fetchLedgerBalance('/main-cash-transactions'),
          fetchLedgerBalance('/petty-cash-transactions'),
          fetchLedgerBalance('/delivery-cash-transactions'),
          api.get('/purchasing/grn'),
          api.get('/companies'),
        ]);

        setCashBookBalance(mainCashBalance);
        setPettyBalance(pettyCashBalance);
        setDeliveryBalance(deliveryCashBalance);

        const grnRows = Array.isArray(grnRes.data)
          ? grnRes.data
          : (grnRes.data?.data || []);

        const grnPayable = (Array.isArray(grnRows) ? grnRows : []).reduce((sum: number, grn: any) => {
          if (String(grn?.payment_timing || 'post_payment') !== 'post_payment') {
            return sum;
          }
          const net = Number(grn?.net_amount || 0);
          const paid = Number(grn?.paid_amount || 0);
          const balance = Math.max(net - paid, 0);
          return sum + balance;
        }, 0);
        setGrnPayableBalance(grnPayable);

        const rows = Array.isArray(companiesRes.data) ? companiesRes.data : (companiesRes.data?.data || []);
        setCompanyBalances(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Error loading company balances:', error);
        setCashBookBalance(0);
        setPettyBalance(0);
        setDeliveryBalance(0);
        setGrnPayableBalance(0);
        setCompanyBalances([]);
      } finally {
        setCompanyBalancesLoading(false);
        setLoading(false);
      }
    };

    loadAccountsDashboard();
  }, [token]);

  const companySummary = useMemo(() => {
    const totalCash = companyBalances.reduce((sum, company) => sum + Number(company.current_cash_balance || 0), 0);
    const totalBank = companyBalances.reduce((sum, company) => sum + Number(company.current_bank_balance || 0), 0);
    const totalCheque = companyBalances.reduce((sum, company) => sum + Number(company.current_cheque_balance || 0), 0);

    return {
      totalCash,
      totalBank,
      totalCheque,
      grandTotal: totalCash + totalBank + totalCheque,
    };
  }, [companyBalances]);

  const money = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const renderAccountBalances = (accounts: CompanyAccountEntry[] | undefined, tone: 'bank' | 'cheque') => {
    if (!accounts || accounts.length === 0) {
      return <span className="text-xs text-gray-400">No accounts</span>;
    }

    return (
      <div className="space-y-2">
        {accounts.map((account) => (
          <div key={account.id} className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1.5">
            <p className="text-xs font-semibold text-gray-800 truncate">
              {account.bank_name || (tone === 'bank' ? 'Bank Account' : 'Cheque Account')}
            </p>
            <p className="text-[11px] text-gray-500 truncate">A/C: {account.account_no || '-'}</p>
            <p className={`text-xs font-bold ${tone === 'bank' ? 'text-sky-700' : 'text-violet-700'}`}>
              {money(Number(account.current_balance || 0))}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const modules = [
    {
      title: 'GRN Payment Control',
      icon: '🧮',
      href: '/dashboard/accounts/grn-payments',
      desc: 'Settle GRN net amounts and track unpaid or partial supplier payments.',
      balance: grnPayableBalance,
      color: 'from-rose-500 to-pink-500',
    },
    {
      title: 'Company Main Account',
      icon: '🏦',
      href: '/dashboard/accounts/main-account',
      desc: 'Live company balances (cash, bank, and cheque) from profile accounting data.',
      balance: companySummary.grandTotal,
      color: 'from-emerald-500 to-teal-500',
    },
    {
      title: 'Cheque Registry',
      icon: '🧾',
      href: '/dashboard/accounts/cheque-registry',
      desc: 'Register received cheques, deposit, track distribution cheques, and issue supplier cheques.',
      balance: companySummary.totalCheque,
      color: 'from-fuchsia-500 to-rose-500',
    },
    
    {
      title: 'Petty Cash Account',
      icon: '🧾',
      href: '/dashboard/accounts/petty-cash',
      desc: 'Small expense accounting and petty cash replenishment.',
      balance: pettyBalance,
      color: 'from-amber-500 to-orange-500',
    },
    {
      title: 'Delivery Cash Account',
      icon: '🚚',
      href: '/dashboard/accounts/delivery-cash',
      desc: 'Track delivery collections and settlement entries.',
      balance: deliveryBalance,
      color: 'from-violet-500 to-indigo-500',
    },
  ];

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-emerald-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>Accounts Active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center">
          <div className="inline-block p-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full mb-4">
            <div className="bg-white rounded-full p-4 text-4xl">💼</div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">Accounts Management</h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-2 px-2">Manage company account books, petty cash, and delivery collections.</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Live backend table data
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((module) => (
            <Link
              key={module.title}
              href={module.href}
              className="group bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-white/30 p-6 transition-all hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${module.color} text-white text-2xl flex items-center justify-center`}>{module.icon}</div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{module.desc}</p>
            </Link>
          ))}
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-cyan-50">
            <h2 className="text-base font-semibold text-gray-900">Company Balance Board</h2>
            <p className="text-xs text-gray-600 mt-1">All company cash, bank account, and cheque account balances.</p>
          </div>

          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-b border-gray-100 bg-white/70">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Total Cash</p>
              <p className="text-lg font-bold text-emerald-800">{money(companySummary.totalCash)}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-sky-700 font-semibold">Total Bank</p>
              <p className="text-lg font-bold text-sky-800">{money(companySummary.totalBank)}</p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-violet-700 font-semibold">Total Cheque</p>
              <p className="text-lg font-bold text-violet-800">{money(companySummary.totalCheque)}</p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-cyan-700 font-semibold">Grand Total</p>
              <p className="text-lg font-bold text-cyan-800">{money(companySummary.grandTotal)}</p>
            </div>
          </div>

          {companyBalancesLoading ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">Loading company balances...</div>
          ) : companyBalances.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">No company balance records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Company</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cash Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Bank Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cheque Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Bank Account Balances</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cheque Account Balances</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {companyBalances.map((company, idx) => {
                    const cash = Number(company.current_cash_balance || 0);
                    const bank = Number(company.current_bank_balance || 0);
                    const cheque = Number(company.current_cheque_balance || 0);
                    const rowTotal = cash + bank + cheque;

                    return (
                      <tr key={company.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{company.name}</td>
                        <td className="px-4 py-3 text-sm text-right text-emerald-700 font-semibold">{money(cash)}</td>
                        <td className="px-4 py-3 text-sm text-right text-sky-700 font-semibold">{money(bank)}</td>
                        <td className="px-4 py-3 text-sm text-right text-violet-700 font-semibold">{money(cheque)}</td>
                        <td className="px-4 py-3 text-sm text-right text-cyan-700 font-bold">{money(rowTotal)}</td>
                        <td className="px-4 py-3 align-top">{renderAccountBalances(company.bank_accounts, 'bank')}</td>
                        <td className="px-4 py-3 align-top">{renderAccountBalances(company.cheque_accounts, 'cheque')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
