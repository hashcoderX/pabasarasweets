'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../../lib/apiClient';

type CompanyChequeAccount = {
  id: number;
  bank_name?: string;
  account_no?: string;
  current_balance?: number;
};

type CompanyBankAccount = {
  id: number;
  bank_name?: string;
  account_no?: string;
  current_balance?: number;
};

type CompanyRow = {
  id: number;
  name: string;
  bank_accounts?: CompanyBankAccount[];
  cheque_accounts?: CompanyChequeAccount[];
};

type ApiCompanyRow = {
  id?: number | string;
  name?: string;
  bank_accounts?: CompanyBankAccount[];
  bankAccounts?: CompanyBankAccount[];
  cheque_accounts?: CompanyChequeAccount[];
  chequeAccounts?: CompanyChequeAccount[];
};

type ChequeRegistryEntry = {
  id: number;
  direction: 'received' | 'issued';
  lifecycle_status: 'registered' | 'deposited' | 'cleared' | 'bounced' | 'issued';
  source_module: 'manual' | 'distribution' | 'supplier_payment';
  cheque_no: string;
  cheque_date?: string;
  deposit_date?: string | null;
  amount: number;
  bank_name?: string | null;
  account_no?: string | null;
  counterparty_name?: string | null;
  reference_no?: string | null;
  notes?: string | null;
  company?: { id: number; name: string };
  company_id?: number;
  company_bank_account_id?: number | null;
  distribution_payment_id?: number | null;
};

type DistributionCheque = {
  id: number;
  payment_number: string;
  payment_date: string;
  created_at?: string;
  load_number?: string | null;
  cheque_date?: string | null;
  cheque_no?: string | null;
  amount: number;
  reference_no?: string | null;
  bank_name?: string | null;
  status?: string | null;
  customer_name?: string;
  customer_code?: string;
  sales_person_name?: string;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateCell = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString();
};

const DISTRIBUTION_CHEQUE_PAGE_SIZE = 10;
const CHEQUE_REGISTRY_PAGE_SIZE = 10;

export default function ChequeRegistryPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [depositingId, setDepositingId] = useState<number | null>(null);
  const [handingOverId, setHandingOverId] = useState<number | null>(null);
  const [returningId, setReturningId] = useState<number | null>(null);
  const [endingClearanceId, setEndingClearanceId] = useState<number | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEntryDepositModal, setShowEntryDepositModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [entries, setEntries] = useState<ChequeRegistryEntry[]>([]);
  const [distributionCheques, setDistributionCheques] = useState<DistributionCheque[]>([]);
  const [distributionChequePage, setDistributionChequePage] = useState(1);
  const [chequeRegistryPage, setChequeRegistryPage] = useState(1);
  const [chequeNoFilter, setChequeNoFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  const [registerForm, setRegisterForm] = useState({
    companyId: '',
    chequeNo: '',
    chequeDate: new Date().toISOString().split('T')[0],
    amount: '',
    bankName: '',
    accountNo: '',
    counterpartyName: '',
    sourceModule: 'manual' as 'manual' | 'distribution',
    distributionPaymentId: '',
    referenceNo: '',
    notes: '',
  });

  const [issueForm, setIssueForm] = useState({
    companyId: '',
    chequeAccountId: '',
    supplierName: '',
    chequeNo: '',
    chequeDate: new Date().toISOString().split('T')[0],
    amount: '',
    bankName: '',
    accountNo: '',
    referenceNo: '',
    notes: '',
  });

  const [entryDepositForm, setEntryDepositForm] = useState({
    entryId: '',
    bankAccountId: '',
    depositDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  const selectedIssueCompany = useMemo(
    () => companies.find((company) => String(company.id) === issueForm.companyId) || null,
    [companies, issueForm.companyId]
  );

  const selectedIssueBankAccount = useMemo(
    () =>
      (selectedIssueCompany?.bank_accounts || []).find(
        (account) => String(account.id) === issueForm.chequeAccountId
      ) || null,
    [selectedIssueCompany, issueForm.chequeAccountId]
  );

  const selectedEntryDepositEntry = useMemo(
    () => entries.find((entry) => String(entry.id) === entryDepositForm.entryId) || null,
    [entries, entryDepositForm.entryId]
  );

  const selectedEntryDepositCompany = useMemo(() => {
    const companyId = Number(selectedEntryDepositEntry?.company_id || selectedEntryDepositEntry?.company?.id || 0);
    if (companyId <= 0) return null;
    return companies.find((company) => company.id === companyId) || null;
  }, [companies, selectedEntryDepositEntry]);

  const handedOverDistributionPaymentIds = useMemo(() => {
    const ids = new Set<number>();
    entries.forEach((entry) => {
      const source = String(entry.source_module || '').trim().toLowerCase();
      const paymentId = Number(entry.distribution_payment_id || 0);
      if (source === 'distribution' && paymentId > 0) {
        ids.add(paymentId);
      }
    });
    return ids;
  }, [entries]);

  const totalDistributionChequePages = useMemo(
    () => Math.max(1, Math.ceil(distributionCheques.length / DISTRIBUTION_CHEQUE_PAGE_SIZE)),
    [distributionCheques.length]
  );

  const currentDistributionChequePage = Math.min(distributionChequePage, totalDistributionChequePages);

  const paginatedDistributionCheques = useMemo(() => {
    const start = (currentDistributionChequePage - 1) * DISTRIBUTION_CHEQUE_PAGE_SIZE;
    return distributionCheques.slice(start, start + DISTRIBUTION_CHEQUE_PAGE_SIZE);
  }, [distributionCheques, currentDistributionChequePage]);

  const distributionChequeRangeStart = distributionCheques.length === 0
    ? 0
    : (currentDistributionChequePage - 1) * DISTRIBUTION_CHEQUE_PAGE_SIZE + 1;
  const distributionChequeRangeEnd = Math.min(
    currentDistributionChequePage * DISTRIBUTION_CHEQUE_PAGE_SIZE,
    distributionCheques.length
  );

  const filteredChequeRegistryEntries = useMemo(() => {
    const chequeNoTerm = chequeNoFilter.trim().toLowerCase();
    const customerTerm = customerFilter.trim().toLowerCase();

    return entries.filter((entry) => {
      const chequeNoMatches =
        !chequeNoTerm || String(entry.cheque_no || '').toLowerCase().includes(chequeNoTerm);
      const customerMatches =
        !customerTerm || String(entry.counterparty_name || '').toLowerCase().includes(customerTerm);
      return chequeNoMatches && customerMatches;
    });
  }, [entries, chequeNoFilter, customerFilter]);

  const totalChequeRegistryPages = useMemo(
    () => Math.max(1, Math.ceil(filteredChequeRegistryEntries.length / CHEQUE_REGISTRY_PAGE_SIZE)),
    [filteredChequeRegistryEntries.length]
  );

  const currentChequeRegistryPage = Math.min(chequeRegistryPage, totalChequeRegistryPages);

  const paginatedChequeRegistryEntries = useMemo(() => {
    const start = (currentChequeRegistryPage - 1) * CHEQUE_REGISTRY_PAGE_SIZE;
    return filteredChequeRegistryEntries.slice(start, start + CHEQUE_REGISTRY_PAGE_SIZE);
  }, [filteredChequeRegistryEntries, currentChequeRegistryPage]);

  const chequeRegistryRangeStart = filteredChequeRegistryEntries.length === 0
    ? 0
    : (currentChequeRegistryPage - 1) * CHEQUE_REGISTRY_PAGE_SIZE + 1;
  const chequeRegistryRangeEnd = Math.min(
    currentChequeRegistryPage * CHEQUE_REGISTRY_PAGE_SIZE,
    filteredChequeRegistryEntries.length
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [companiesRes, registryRes] = await Promise.all([
        api.get('/companies'),
        api.get('/cheque-registry', { params: { per_page: 200 } }),
      ]);

      const companyRows = Array.isArray(companiesRes.data) ? companiesRes.data : (companiesRes.data?.data || []);
      const normalizedCompanies: CompanyRow[] = (Array.isArray(companyRows) ? companyRows : [])
        .map((company: ApiCompanyRow) => ({
          id: Number(company?.id || 0),
          name: String(company?.name || 'Company'),
          bank_accounts: Array.isArray(company?.bank_accounts)
            ? company.bank_accounts
            : (Array.isArray(company?.bankAccounts) ? company.bankAccounts : []),
          cheque_accounts: Array.isArray(company?.cheque_accounts)
            ? company.cheque_accounts
            : (Array.isArray(company?.chequeAccounts) ? company.chequeAccounts : []),
        }))
        .filter((company: CompanyRow) => company.id > 0);
      setCompanies(normalizedCompanies);

      const registryPayload = registryRes.data;
      const registryRows = registryPayload?.data?.data || registryPayload?.data || [];
      setEntries(Array.isArray(registryRows) ? registryRows : []);

      const distRows = registryPayload?.distribution_cheques || [];
      setDistributionCheques(Array.isArray(distRows) ? distRows : []);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }
      setError('Failed to load cheque registry data.');
    } finally {
      setLoading(false);
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
    loadData();
  }, [token]);

  useEffect(() => {
    if (!issueForm.chequeAccountId || !selectedIssueBankAccount) {
      setIssueForm((prev) => {
        if (prev.bankName === '' && prev.accountNo === '') return prev;
        return { ...prev, bankName: '', accountNo: '' };
      });
      return;
    }

    const nextBankName = String(selectedIssueBankAccount.bank_name || '');
    const nextAccountNo = String(selectedIssueBankAccount.account_no || '');
    setIssueForm((prev) => {
      if (prev.bankName === nextBankName && prev.accountNo === nextAccountNo) return prev;
      return {
        ...prev,
        bankName: nextBankName,
        accountNo: nextAccountNo,
      };
    });
  }, [issueForm.chequeAccountId, selectedIssueBankAccount]);

  useEffect(() => {
    setChequeRegistryPage(1);
  }, [chequeNoFilter, customerFilter]);

  useEffect(() => {
    if (!companies.length) return;

    setRegisterForm((prev) => (prev.companyId ? prev : { ...prev, companyId: String(companies[0].id) }));
    setIssueForm((prev) => (prev.companyId ? prev : { ...prev, companyId: String(companies[0].id) }));
  }, [companies]);

  const submitRegister = async () => {
    setError('');
    setSuccess('');

    const amount = Number(registerForm.amount || 0);
    if (!registerForm.companyId || !registerForm.chequeNo || !registerForm.chequeDate || amount <= 0 || !registerForm.counterpartyName) {
      setError('Please complete required register cheque fields.');
      return;
    }

    if (registerForm.sourceModule === 'distribution' && !registerForm.distributionPaymentId) {
      setError('Please select a distribution cheque when source is distribution.');
      return;
    }

    try {
      setSaving(true);
      await api.post('/cheque-registry/register', {
        company_id: Number(registerForm.companyId),
        cheque_no: registerForm.chequeNo,
        cheque_date: registerForm.chequeDate,
        amount,
        bank_name: registerForm.bankName || null,
        account_no: registerForm.accountNo || null,
        counterparty_name: registerForm.counterpartyName,
        source_module: registerForm.sourceModule,
        distribution_payment_id: registerForm.sourceModule === 'distribution' ? Number(registerForm.distributionPaymentId) : null,
        reference_no: registerForm.referenceNo || null,
        notes: registerForm.notes || null,
      });

      setRegisterForm((prev) => ({
        ...prev,
        chequeNo: '',
        amount: '',
        bankName: '',
        accountNo: '',
        counterpartyName: '',
        distributionPaymentId: '',
        referenceNo: '',
        notes: '',
      }));
      setSuccess('Cheque registered successfully.');
      await loadData();
      setShowRegisterModal(false);
    } catch (err) {
      const message = (isAxiosError(err) && (err.response?.data?.message as string)) || 'Failed to register cheque.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const submitIssue = async () => {
    setError('');
    setSuccess('');

    const amount = Number(issueForm.amount || 0);
    if (!issueForm.companyId || !issueForm.chequeAccountId || !issueForm.supplierName || !issueForm.chequeNo || !issueForm.chequeDate || amount <= 0) {
      setError('Please complete required issued cheque fields.');
      return;
    }

    try {
      setSaving(true);
      await api.post('/cheque-registry/issue', {
        company_id: Number(issueForm.companyId),
        company_bank_account_id: Number(issueForm.chequeAccountId),
        supplier_name: issueForm.supplierName,
        cheque_no: issueForm.chequeNo,
        cheque_date: issueForm.chequeDate,
        amount,
        bank_name: issueForm.bankName || null,
        account_no: issueForm.accountNo || null,
        reference_no: issueForm.referenceNo || null,
        notes: issueForm.notes || null,
      });

      setIssueForm((prev) => ({
        ...prev,
        supplierName: '',
        chequeNo: '',
        amount: '',
        bankName: '',
        accountNo: '',
        referenceNo: '',
        notes: '',
      }));
      setSuccess('Issued cheque saved successfully.');
      await loadData();
    } catch (err) {
      const message = (isAxiosError(err) && (err.response?.data?.message as string)) || 'Failed to save issued cheque.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleHandoverDistributionCheque = async (row: DistributionCheque) => {
    setError('');
    setSuccess('');

    if (handedOverDistributionPaymentIds.has(row.id)) {
      setSuccess('This cheque is already handed over and registered.');
      return;
    }

    const companyId = Number(registerForm.companyId || companies[0]?.id || 0);
    if (companyId <= 0) {
      setError('Select a company in Register Received Cheque section before handing over.');
      return;
    }

    const amount = Number(row.amount || 0);
    if (amount <= 0) {
      setError('Invalid cheque amount for selected distribution cheque.');
      return;
    }

    const chequeNo = String(row.cheque_no || row.reference_no || row.payment_number || '').trim();
    const chequeDate = String(row.cheque_date || row.payment_date || '').trim();

    if (!chequeNo || !chequeDate) {
      setError('Missing cheque number or cheque date for selected distribution cheque.');
      return;
    }

    try {
      setHandingOverId(row.id);
      const response = await api.post('/cheque-registry/register', {
        company_id: companyId,
        cheque_no: chequeNo,
        cheque_date: chequeDate,
        amount,
        bank_name: row.bank_name || null,
        account_no: null,
        counterparty_name: row.customer_name || 'Distribution Customer',
        source_module: 'distribution',
        distribution_payment_id: row.id,
        reference_no: row.reference_no || row.payment_number || null,
        notes: `Handed over from distribution payment ${row.payment_number}`,
      });

      const createdEntry = response?.data?.data as ChequeRegistryEntry | undefined;
      if (createdEntry?.id) {
        setEntries((prev) => [createdEntry, ...prev.filter((entry) => entry.id !== createdEntry.id)]);
      }

      setSuccess('Cheque handed over and registered successfully. You can now deposit it from Cheque Registry Entries.');
    } catch (err) {
      const message = (isAxiosError(err) && (err.response?.data?.message as string)) || 'Failed to hand over cheque.';
      setError(message);
    } finally {
      setHandingOverId(null);
    }
  };

  const closeEntryDepositModal = () => {
    setShowEntryDepositModal(false);
    setEntryDepositForm({
      entryId: '',
      bankAccountId: '',
      depositDate: new Date().toISOString().split('T')[0],
      notes: '',
    });
  };

  const handleBankDepositFromEntry = (entry: ChequeRegistryEntry) => {
    setError('');
    setSuccess('');

    const status = String(entry.lifecycle_status || '').toLowerCase();
    if (status === 'deposited' || status === 'cleared') {
      setSuccess('This cheque is already deposited.');
      return;
    }

    if (status === 'bounced') {
      setError('Returned cheques cannot be deposited.');
      return;
    }

    const companyId = Number(entry.company_id || entry.company?.id || 0);
    if (companyId <= 0) {
      setError('Cheque company is missing for bank deposit.');
      return;
    }

    const company = companies.find((row) => row.id === companyId) || null;
    const companyBankAccounts = (company?.bank_accounts || []);
    if (companyBankAccounts.length === 0) {
      setError('No bank account found for this company. Add a company bank account first.');
      return;
    }

    const preferredByEntryBankId = companyBankAccounts.find(
      (account) => Number(account.id || 0) > 0 && Number(account.id || 0) === Number(entry.company_bank_account_id || 0)
    );
    const preferredByAccountNo = companyBankAccounts.find(
      (account) => String(account.account_no || '').trim() !== '' &&
        String(account.account_no || '').trim().toLowerCase() === String(entry.account_no || '').trim().toLowerCase()
    );
    const fallbackByBankName = companyBankAccounts.find(
      (account) => String(account.bank_name || '').trim() !== '' &&
        String(account.bank_name || '').trim().toLowerCase() === String(entry.bank_name || '').trim().toLowerCase()
    );
    const selectedBankAccount = preferredByEntryBankId || preferredByAccountNo || fallbackByBankName || companyBankAccounts[0] || null;

    if (!selectedBankAccount?.id) {
      setError('No bank account found for this company. Add a company bank account first.');
      return;
    }

    setEntryDepositForm({
      entryId: String(entry.id),
      bankAccountId: String(selectedBankAccount.id),
      depositDate: new Date().toISOString().split('T')[0],
      notes: 'Deposited from Cheque Registry Entries action',
    });
    setShowEntryDepositModal(true);
  };

  const submitEntryDepositFromModal = async () => {
    setError('');
    setSuccess('');

    const entryId = Number(entryDepositForm.entryId || 0);
    const bankAccountId = Number(entryDepositForm.bankAccountId || 0);
    const depositDate = String(entryDepositForm.depositDate || '').trim();
    const selectedEntry = entries.find((entry) => entry.id === entryId);

    if (entryId <= 0 || !selectedEntry) {
      setError('Please select a cheque entry to deposit.');
      return;
    }

    if (bankAccountId <= 0) {
      setError('Please select a bank account for deposit.');
      return;
    }

    if (!depositDate) {
      setError('Please select a deposit date.');
      return;
    }

    try {
      setDepositingId(entryId);
      const response = await api.post(`/cheque-registry/${entryId}/deposit`, {
        company_bank_account_id: bankAccountId,
        deposit_date: depositDate,
        notes: entryDepositForm.notes || null,
      });

      const updatedEntry = response?.data?.data as ChequeRegistryEntry | undefined;
      if (updatedEntry?.id) {
        setEntries((prev) => prev.map((row) => (row.id === updatedEntry.id ? updatedEntry : row)));
      }

      setSuccess('Cheque deposited and marked as deposited.');
      closeEntryDepositModal();
    } catch (err) {
      const message = (isAxiosError(err) && (err.response?.data?.message as string)) || 'Failed to deposit cheque.';
      setError(message);
    } finally {
      setDepositingId(null);
    }
  };

  const handleReturnCheque = async (entry: ChequeRegistryEntry) => {
    setError('');
    setSuccess('');

    const status = String(entry.lifecycle_status || '').toLowerCase();
    if (status === 'bounced') {
      setSuccess('This cheque is already marked as returned.');
      return;
    }

    try {
      setReturningId(entry.id);
      await api.post(`/cheque-registry/${entry.id}/return`, {
        notes: `Returned from cheque registry action`,
      });
      setSuccess('Cheque returned successfully.');
      await loadData();
    } catch (err) {
      const message = (isAxiosError(err) && (err.response?.data?.message as string)) || 'Failed to return cheque.';
      setError(message);
    } finally {
      setReturningId(null);
    }
  };

  const handleEndClearance = async (entry: ChequeRegistryEntry) => {
    setError('');
    setSuccess('');

    const status = String(entry.lifecycle_status || '').toLowerCase();
    if (status === 'cleared') {
      setSuccess('This cheque process is already ended and cleared.');
      return;
    }

    try {
      setEndingClearanceId(entry.id);
      await api.post(`/cheque-registry/${entry.id}/end-clearance`, {
        notes: 'Ended cheque process from registry action',
      });
      setSuccess('Cheque process ended and bank account credited successfully.');
      await loadData();
    } catch (err) {
      const message = (isAxiosError(err) && (err.response?.data?.message as string)) || 'Failed to end cheque clearance.';
      setError(message);
    } finally {
      setEndingClearanceId(null);
    }
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <Link href="/dashboard/accounts" className="flex items-center space-x-2 text-gray-700 hover:text-emerald-600">
              <span>←</span>
              <span className="font-medium text-sm sm:text-base">Back to Accounts</span>
            </Link>
            <div className="text-sm text-gray-600">Cheque Registry Operations</div>
          </div>
        </div>
      </nav>

      <main className="w-full py-8 px-3 sm:px-4 lg:px-6 space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Cheque Registry</h1>
          <p className="text-sm text-gray-600 mt-1">Register received cheques, deposit cheques, track distribution salesperson cheques, and save issued supplier cheques.</p>
        </div>

        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div> : null}

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Register Received Cheque</h2>
              <p className="text-sm text-gray-600">Open modal to register and handover received cheques.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowRegisterModal(true)}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700"
            >
              Open Register Modal
            </button>
          </div>
        </section>

        {showRegisterModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-white/70 bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-lg font-semibold text-gray-900">Register Received Cheque</h3>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <select value={registerForm.companyId} onChange={(e) => setRegisterForm((p) => ({ ...p, companyId: e.target.value }))} className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm">
                  <option value="">Select Company</option>
                  {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
                </select>
                <input value={registerForm.counterpartyName} onChange={(e) => setRegisterForm((p) => ({ ...p, counterpartyName: e.target.value }))} placeholder="Received From" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
                <input value={registerForm.chequeNo} onChange={(e) => setRegisterForm((p) => ({ ...p, chequeNo: e.target.value }))} placeholder="Cheque No" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
                <input type="date" value={registerForm.chequeDate} onChange={(e) => setRegisterForm((p) => ({ ...p, chequeDate: e.target.value }))} className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
                <input type="number" min="0" step="0.01" value={registerForm.amount} onChange={(e) => setRegisterForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />

                <input value={registerForm.bankName} onChange={(e) => setRegisterForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="Bank Name" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
                <input value={registerForm.accountNo} onChange={(e) => setRegisterForm((p) => ({ ...p, accountNo: e.target.value }))} placeholder="Cheque No" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
                <select value={registerForm.sourceModule} onChange={(e) => setRegisterForm((p) => ({ ...p, sourceModule: e.target.value as 'manual' | 'distribution', distributionPaymentId: '' }))} className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm">
                  <option value="manual">Source: Manual</option>
                  <option value="distribution">Source: Distribution</option>
                </select>
                {registerForm.sourceModule === 'distribution' ? (
                  <select value={registerForm.distributionPaymentId} onChange={(e) => setRegisterForm((p) => ({ ...p, distributionPaymentId: e.target.value }))} className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm md:col-span-2">
                    <option value="">Select Distribution Cheque</option>
                    {distributionCheques.map((row) => (
                      <option key={row.id} value={String(row.id)}>
                        {`${row.payment_number} | ${row.customer_name || '-'} | ${money(Number(row.amount || 0))}`}
                      </option>
                    ))}
                  </select>
                ) : <div className="md:col-span-2"></div>}

                <input value={registerForm.referenceNo} onChange={(e) => setRegisterForm((p) => ({ ...p, referenceNo: e.target.value }))} placeholder="Reference" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
                <input value={registerForm.notes} onChange={(e) => setRegisterForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm md:col-span-3" />
                <button type="button" onClick={submitRegister} disabled={saving} className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Register Cheque'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-lg">
          <h2 className="text-lg font-semibold text-gray-900">Issued Cheque (Company to Supplier)</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Company</label>
              <select value={issueForm.companyId} onChange={(e) => setIssueForm((p) => ({ ...p, companyId: e.target.value, chequeAccountId: '', bankName: '', accountNo: '' }))} className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm">
                <option value="">Select Company</option>
                {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Company Bank Account</label>
              <select value={issueForm.chequeAccountId} onChange={(e) => setIssueForm((p) => ({ ...p, chequeAccountId: e.target.value }))} className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm">
                <option value="">Select Company Bank Account</option>
                {(selectedIssueCompany?.bank_accounts || []).map((acc) => (
                  <option key={acc.id} value={String(acc.id)}>
                    {`${acc.bank_name || 'Bank Account'} (${acc.account_no || '-'}) - ${money(Number(acc.current_balance || 0))}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Supplier Name</label>
              <input value={issueForm.supplierName} onChange={(e) => setIssueForm((p) => ({ ...p, supplierName: e.target.value }))} placeholder="Supplier Name" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Cheque No</label>
              <input value={issueForm.chequeNo} onChange={(e) => setIssueForm((p) => ({ ...p, chequeNo: e.target.value }))} placeholder="Cheque No" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Cheque Date</label>
              <input type="date" value={issueForm.chequeDate} onChange={(e) => setIssueForm((p) => ({ ...p, chequeDate: e.target.value }))} className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Amount</label>
              <input type="number" min="0" step="0.01" value={issueForm.amount} onChange={(e) => setIssueForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Bank Name</label>
              <input value={issueForm.bankName} onChange={(e) => setIssueForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="Bank Name" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Account No</label>
              <input value={issueForm.accountNo} onChange={(e) => setIssueForm((p) => ({ ...p, accountNo: e.target.value }))} placeholder="Account No" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Reference</label>
              <input value={issueForm.referenceNo} onChange={(e) => setIssueForm((p) => ({ ...p, referenceNo: e.target.value }))} placeholder="Reference" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
              <input value={issueForm.notes} onChange={(e) => setIssueForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="w-full rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm" />
            </div>

            <button type="button" onClick={submitIssue} disabled={saving} className="rounded-full bg-gradient-to-r from-rose-600 to-orange-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-rose-700 hover:to-orange-700 disabled:opacity-60 md:col-span-2">
              {saving ? 'Saving...' : 'Save Issued Cheque'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
            <h2 className="text-base font-semibold text-gray-900">Cheque Registry Entries</h2>
          </div>
          <div className="grid gap-3 border-b border-gray-100 bg-white/80 px-5 py-3 md:grid-cols-2">
            <input
              value={chequeNoFilter}
              onChange={(e) => setChequeNoFilter(e.target.value)}
              placeholder="Filter by cheque no"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />
            <input
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              placeholder="Filter by customer"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Direction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cheque No</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Counterparty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Source</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredChequeRegistryEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">No cheque registry records found.</td>
                  </tr>
                ) : paginatedChequeRegistryEntries.map((entry, idx) => {
                  const absoluteIndex = (currentChequeRegistryPage - 1) * CHEQUE_REGISTRY_PAGE_SIZE + idx;
                  return (
                  <tr key={entry.id} className={absoluteIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.cheque_date ? new Date(entry.cheque_date).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{entry.direction}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{entry.lifecycle_status}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{entry.company?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.cheque_no}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700">{money(Number(entry.amount || 0))}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.counterparty_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{entry.source_module}</td>
                    <td className="px-4 py-3 text-right">
                      {entry.direction === 'received' ? (
                        <div className="flex items-center justify-end gap-2">
                          {String(entry.lifecycle_status).toLowerCase() === 'registered' ? (
                            <button
                              type="button"
                              onClick={() => handleBankDepositFromEntry(entry)}
                              disabled={depositingId === entry.id || returningId === entry.id || endingClearanceId === entry.id}
                              className="rounded-full bg-gradient-to-r from-sky-600 to-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:from-sky-700 hover:to-cyan-700 disabled:opacity-60"
                            >
                              {depositingId === entry.id ? 'Depositing...' : 'Bank Deposit'}
                            </button>
                          ) : null}

                          {!['bounced', 'cleared'].includes(String(entry.lifecycle_status).toLowerCase()) ? (
                            <button
                              type="button"
                              onClick={() => handleReturnCheque(entry)}
                              disabled={returningId === entry.id || endingClearanceId === entry.id}
                              className="rounded-full bg-gradient-to-r from-rose-600 to-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:from-rose-700 hover:to-orange-700 disabled:opacity-60"
                            >
                              {returningId === entry.id ? 'Returning...' : 'Cheque Return'}
                            </button>
                          ) : null}

                          {String(entry.lifecycle_status).toLowerCase() !== 'cleared' ? (
                            <button
                              type="button"
                              onClick={() => handleEndClearance(entry)}
                              disabled={endingClearanceId === entry.id || returningId === entry.id}
                              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60"
                            >
                              {endingClearanceId === entry.id ? 'Clearing...' : 'End Clearance'}
                            </button>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Cleared
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {chequeRegistryRangeStart}-{chequeRegistryRangeEnd} of {filteredChequeRegistryEntries.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChequeRegistryPage((prev) => Math.max(1, prev - 1))}
                disabled={currentChequeRegistryPage <= 1}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-gray-700">
                Page {currentChequeRegistryPage} of {totalChequeRegistryPages}
              </span>
              <button
                type="button"
                onClick={() => setChequeRegistryPage((prev) => Math.min(totalChequeRegistryPages, prev + 1))}
                disabled={currentChequeRegistryPage >= totalChequeRegistryPages}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-sky-50">
            <h2 className="text-base font-semibold text-gray-900">Distribution Cheques (Salesperson Added)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1250px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Payment No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cheque No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cheque Receive Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Load No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cheque Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Salesperson</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Bank</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {distributionCheques.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No distribution cheque records found.</td>
                  </tr>
                ) : paginatedDistributionCheques.map((row, idx) => {
                  const absoluteIndex = (currentDistributionChequePage - 1) * DISTRIBUTION_CHEQUE_PAGE_SIZE + idx;
                  return (
                  <tr key={row.id} className={absoluteIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.payment_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.cheque_no || row.reference_no || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDateCell(row.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.load_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDateCell(row.cheque_date || row.payment_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.customer_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.sales_person_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.bank_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-sky-700">{money(Number(row.amount || 0))}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{row.status || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      {handedOverDistributionPaymentIds.has(row.id) ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Handed Over
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleHandoverDistributionCheque(row)}
                          disabled={handingOverId === row.id}
                          className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60"
                        >
                          {handingOverId === row.id ? 'Processing...' : 'Handovered'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {distributionChequeRangeStart}-{distributionChequeRangeEnd} of {distributionCheques.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDistributionChequePage((prev) => Math.max(1, prev - 1))}
                disabled={currentDistributionChequePage <= 1}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-gray-700">
                Page {currentDistributionChequePage} of {totalDistributionChequePages}
              </span>
              <button
                type="button"
                onClick={() => setDistributionChequePage((prev) => Math.min(totalDistributionChequePages, prev + 1))}
                disabled={currentDistributionChequePage >= totalDistributionChequePages}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>

      {showEntryDepositModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl border border-white/70 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-semibold text-gray-900">Deposit Cheque to Bank</h3>
              <button
                type="button"
                onClick={closeEntryDepositModal}
                disabled={depositingId !== null}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <p><span className="font-semibold">Cheque No:</span> {selectedEntryDepositEntry?.cheque_no || '-'}</p>
                <p><span className="font-semibold">Customer:</span> {selectedEntryDepositEntry?.counterparty_name || '-'}</p>
                <p><span className="font-semibold">Amount:</span> {money(Number(selectedEntryDepositEntry?.amount || 0))}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Deposit Bank Account</label>
                <select
                  value={entryDepositForm.bankAccountId}
                  onChange={(e) => setEntryDepositForm((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                >
                  <option value="">Select company bank account</option>
                  {(selectedEntryDepositCompany?.bank_accounts || []).map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {(account.bank_name || 'Bank Account')} ({account.account_no || '-'}) - {money(Number(account.current_balance || 0))}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Deposit Date</label>
                <input
                  type="date"
                  value={entryDepositForm.depositDate}
                  onChange={(e) => setEntryDepositForm((prev) => ({ ...prev, depositDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <input
                  value={entryDepositForm.notes}
                  onChange={(e) => setEntryDepositForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Deposit note"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-black focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEntryDepositModal}
                disabled={depositingId !== null}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEntryDepositFromModal}
                disabled={depositingId !== null}
                className="rounded-full bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-sky-700 hover:to-cyan-700 disabled:opacity-60"
              >
                {depositingId !== null ? 'Depositing...' : 'Confirm Deposit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
