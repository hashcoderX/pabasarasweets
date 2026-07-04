'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface CompanyProfile {
  id: number;
  name: string;
  email: string;
  address?: string;
  phone?: string;
  telephone?: string;
  whatsapp_number?: string;
  website?: string;
  country?: string;
  currency?: string;
  logo_path?: string | null;
  logo_url?: string | null;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: AccountRow[];
  cheque_accounts?: AccountRow[];
  bank_name?: string;
  bank_account_no?: string;
  created_at?: string;
  updated_at?: string;
}

interface AccountRow {
  bank_name: string;
  account_no: string;
  current_balance: number;
}

const PROFILE_ID_KEY = 'company_profile_id';
const PROFILE_DATA_KEY = 'company_profile_data';

const toSafeStorageUrl = (value: string, apiBase: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const baseOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : apiBase || '';

  if (raw.startsWith('/storage/')) {
    return `${baseOrigin}${raw}`;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/storage/')) {
        return `${baseOrigin}${parsed.pathname}${parsed.search || ''}`;
      }
    } catch {
      return raw;
    }
  }

  return raw;
};

export default function CompanySettingsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [resettingSystem, setResettingSystem] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetModalError, setResetModalError] = useState('');
  const [resetStatusMessage, setResetStatusMessage] = useState('');
  const [resetStatusType, setResetStatusType] = useState<'success' | 'error' | ''>('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageModalTitle, setMessageModalTitle] = useState('');
  const [messageModalBody, setMessageModalBody] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [telephone, setTelephone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('LKR');
  const [currentCashBalance, setCurrentCashBalance] = useState('0');
  const [bankAccounts, setBankAccounts] = useState<Array<{ bank_name: string; account_no: string; current_balance: string }>>([
    { bank_name: '', account_no: '', current_balance: '0' },
  ]);
  const [chequeAccounts, setChequeAccounts] = useState<Array<{ bank_name: string; account_no: string; current_balance: string }>>([
    { bank_name: '', account_no: '', current_balance: '0' },
  ]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoPreviewIsObjectUrl, setLogoPreviewIsObjectUrl] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState(false);

  const router = useRouter();

  const API_BASE = '';

  const normalizeLogoUrl = (company?: CompanyProfile | null): string => {
    if (!company) return '';

    const rawUrl = String(company.logo_url || '').trim();
    const rawPath = String(company.logo_path || '').trim();

    if (rawUrl) {
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return toSafeStorageUrl(rawUrl, API_BASE);
      }

      if (rawUrl.startsWith('/')) {
        return toSafeStorageUrl(`${API_BASE}${rawUrl}`, API_BASE);
      }

      return toSafeStorageUrl(`${API_BASE}/${rawUrl}`, API_BASE);
    }

    if (rawPath) {
      return toSafeStorageUrl(`${API_BASE}/storage/${rawPath.replace(/^\/+/, '')}`, API_BASE);
    }

    return '';
  };

  const setLogoPreviewValue = (value: string, isObjectUrl: boolean) => {
    if (logoPreviewIsObjectUrl && logoPreview && logoPreview !== value) {
      URL.revokeObjectURL(logoPreview);
    }

    setLogoPreview(value);
    setLogoPreviewIsObjectUrl(isObjectUrl);
    setLogoPreviewError(false);
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

    const bootstrap = async () => {
      try {
        const userRes = await axios.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role: any) => String(role?.name || role || ''))
            : []),
        ]
          .join(' ')
          .toLowerCase();

        const adminUser =
          !employeeId ||
          roleNames.includes('super admin') ||
          roleNames.includes('superadmin') ||
          roleNames.includes('administrator') ||
          roleNames.includes('admin');

        setIsAdmin(adminUser);

        if (!adminUser) {
          router.push('/dashboard');
          return;
        }

        const profileIdRaw = localStorage.getItem(PROFILE_ID_KEY);
        if (profileIdRaw) {
          const parsed = Number(profileIdRaw);
          if (parsed > 0) setActiveProfileId(parsed);
        }

        await fetchCompanies(token);
      } catch (error) {
        console.error('Error loading company settings access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    bootstrap();
  }, [token, router]);

  const fetchCompanies = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      const res = await axios.get('/api/companies', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      const rowsRaw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      const rows = rowsRaw.map((company: CompanyProfile) => ({
        ...company,
        logo_url: normalizeLogoUrl(company),
      }));
      setCompanies(rows);

      if (rows.length > 0 && !activeProfileId) {
        const first = rows[0];
        setActiveCompanyProfile(first);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const activeCompany = useMemo(
    () => companies.find((company) => Number(company.id) === Number(activeProfileId)) || null,
    [companies, activeProfileId]
  );

  const profileCount = companies.length;
  const profileCoverage = activeCompany
    ? [
        activeCompany.name,
        activeCompany.email,
        activeCompany.phone,
        activeCompany.telephone,
        activeCompany.whatsapp_number,
        activeCompany.address,
        activeCompany.country,
        activeCompany.currency,
        activeCompany.current_cash_balance,
        activeCompany.current_bank_balance,
        activeCompany.current_cheque_balance,
        activeCompany.bank_accounts?.length,
        activeCompany.cheque_accounts?.length,
      ].filter((value) => Boolean(String(value || '').trim())).length
    : 0;
  const profileHealth = activeCompany ? Math.round((profileCoverage / 13) * 100) : 0;

  const formatMoney = (value?: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const setActiveCompanyProfile = (company: CompanyProfile) => {
    const normalizedCompany: CompanyProfile = {
      ...company,
      logo_url: normalizeLogoUrl(company),
    };

    setActiveProfileId(company.id);
    localStorage.setItem(PROFILE_ID_KEY, String(company.id));
    localStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(normalizedCompany));
  };

  const resetForm = () => {
    setEditingCompanyId(null);
    setName('');
    setEmail('');
    setPhone('');
    setTelephone('');
    setWhatsappNumber('');
    setAddress('');
    setWebsite('');
    setCountry('');
    setCurrency('LKR');
    setCurrentCashBalance('0');
    setBankAccounts([{ bank_name: '', account_no: '', current_balance: '0' }]);
    setChequeAccounts([{ bank_name: '', account_no: '', current_balance: '0' }]);
    setLogoFile(null);
    setLogoPreviewValue('', false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (company: CompanyProfile) => {
    setEditingCompanyId(company.id);
    setName(company.name || '');
    setEmail(company.email || '');
    setPhone(company.phone || '');
    setTelephone(company.telephone || '');
    setWhatsappNumber(company.whatsapp_number || '');
    setAddress(company.address || '');
    setWebsite(company.website || '');
    setCountry(company.country || '');
    setCurrency(company.currency || 'LKR');
    setCurrentCashBalance(String(company.current_cash_balance ?? 0));

    const existingBankAccounts = Array.isArray(company.bank_accounts) ? company.bank_accounts : [];
    const existingChequeAccounts = Array.isArray(company.cheque_accounts) ? company.cheque_accounts : [];

    if (existingBankAccounts.length > 0) {
      setBankAccounts(
        existingBankAccounts.map((row) => ({
          bank_name: row.bank_name || '',
          account_no: row.account_no || '',
          current_balance: String(row.current_balance ?? 0),
        }))
      );
    } else {
      setBankAccounts([
        {
          bank_name: company.bank_name || '',
          account_no: company.bank_account_no || '',
          current_balance: String(company.current_bank_balance ?? 0),
        },
      ]);
    }

    if (existingChequeAccounts.length > 0) {
      setChequeAccounts(
        existingChequeAccounts.map((row) => ({
          bank_name: row.bank_name || '',
          account_no: row.account_no || '',
          current_balance: String(row.current_balance ?? 0),
        }))
      );
    } else {
      setChequeAccounts([{ bank_name: '', account_no: '', current_balance: String(company.current_cheque_balance ?? 0) }]);
    }

    setLogoFile(null);
    setLogoPreviewValue(normalizeLogoUrl(company), false);
    setShowForm(true);
  };

  useEffect(() => {
    return () => {
      if (logoPreviewIsObjectUrl && logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview, logoPreviewIsObjectUrl]);

  const addBankAccountRow = () => {
    setBankAccounts((prev) => [...prev, { bank_name: '', account_no: '', current_balance: '0' }]);
  };

  const addChequeAccountRow = () => {
    setChequeAccounts((prev) => [...prev, { bank_name: '', account_no: '', current_balance: '0' }]);
  };

  const removeBankAccountRow = (index: number) => {
    setBankAccounts((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const removeChequeAccountRow = (index: number) => {
    setChequeAccounts((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const updateBankAccountRow = (index: number, key: 'bank_name' | 'account_no' | 'current_balance', value: string) => {
    setBankAccounts((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const updateChequeAccountRow = (index: number, key: 'bank_name' | 'account_no' | 'current_balance', value: string) => {
    setChequeAccounts((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = new FormData();
    payload.append('name', name);
    payload.append('email', email);
    if (phone.trim()) payload.append('phone', phone.trim());
    if (telephone.trim()) payload.append('telephone', telephone.trim());
    if (whatsappNumber.trim()) payload.append('whatsapp_number', whatsappNumber.trim());
    if (address.trim()) payload.append('address', address.trim());
    if (website.trim()) payload.append('website', website.trim());
    if (country.trim()) payload.append('country', country.trim());
    if (currency.trim()) payload.append('currency', currency.trim());
    payload.append('current_cash_balance', String(Number(currentCashBalance || 0)));

    const normalizedBankAccounts = bankAccounts
      .map((row) => ({
        bank_name: row.bank_name.trim(),
        account_no: row.account_no.trim(),
        current_balance: Number(row.current_balance || 0),
      }))
      .filter((row) => row.bank_name || row.account_no || row.current_balance > 0);

    const normalizedChequeAccounts = chequeAccounts
      .map((row) => ({
        bank_name: row.bank_name.trim(),
        account_no: row.account_no.trim(),
        current_balance: Number(row.current_balance || 0),
      }))
      .filter((row) => row.bank_name || row.account_no || row.current_balance > 0);

    payload.append('bank_accounts', JSON.stringify(normalizedBankAccounts));
    payload.append('cheque_accounts', JSON.stringify(normalizedChequeAccounts));
    if (logoFile) payload.append('logo', logoFile);

    try {
      setSaving(true);

      if (editingCompanyId) {
        payload.append('_method', 'PUT');
        await axios.post(`/api/companies/${editingCompanyId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post('/api/companies', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      await fetchCompanies();
      setShowForm(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving company profile:', error);
      setMessageModalTitle('Save Failed');
      setMessageModalBody(error?.response?.data?.message || 'Failed to save company profile.');
      setShowMessageModal(true);
    } finally {
      setSaving(false);
    }
  };

  const handleResetSystem = async () => {
    if (resettingSystem) return;

    setResetModalError('');
    setResetConfirmText('');
    setShowResetModal(true);
  };

  const confirmSystemReset = async () => {
    if (resettingSystem) return;

    if (resetConfirmText.trim() !== 'RESET') {
      setResetModalError('Please type RESET exactly to continue.');
      return;
    }

    try {
      setResettingSystem(true);
      setResetModalError('');
      setResetStatusMessage('');
      setResetStatusType('');

      const res = await axios.post(
        '/api/system/reset',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const nextToken = String(res?.data?.token || '').trim();

      localStorage.clear();
      if (nextToken) {
        localStorage.setItem('token', nextToken);
        setToken(nextToken);
      }

      setCompanies([]);
      setActiveProfileId(null);
      resetForm();
      setShowForm(false);
      setShowResetModal(false);
      setResetConfirmText('');

      setResetStatusType('success');
      setResetStatusMessage(res?.data?.message || 'System reset completed successfully.');
      await fetchCompanies(nextToken || token);
    } catch (error: any) {
      console.error('Error resetting system:', error);
      setResetStatusType('error');
      setResetStatusMessage(error?.response?.data?.message || 'Failed to reset system.');
    } finally {
      setResettingSystem(false);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-sky-50 to-emerald-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-12 -left-16 w-72 h-72 bg-cyan-200/60 rounded-full blur-3xl"></div>
        <div className="absolute top-24 right-0 w-80 h-80 bg-sky-200/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-200/50 rounded-full blur-3xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Company Settings</h1>
              <p className="text-xs text-gray-500">Configure company profiles for invoices, documents, and operational identity.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back to Dashboard
              </button>
              <button
                onClick={openCreate}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-emerald-700 hover:to-cyan-700 shadow-lg shadow-emerald-200/50 transition-all"
              >
                Add Company Profile
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-2xl border border-white/70 bg-white/80 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Company Identity Center</h2>
              <p className="text-sm text-gray-600 mt-1">Maintain profile consistency for invoices, printed docs, and branch operations.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700 border border-cyan-200">
                Profiles: {profileCount}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                Active Health: {profileHealth}%
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-700 font-semibold">Active Profile</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{activeCompany ? activeCompany.name : 'Not Set'}</p>
              <p className="text-xs text-gray-600 mt-1">Selected profile is used in headers and print outputs.</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-sky-700 font-semibold">Data Completeness</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{profileHealth}%</p>
              <div className="mt-3 h-2 w-full rounded-full bg-sky-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-500" style={{ width: `${profileHealth}%` }}></div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Currency</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{activeCompany?.currency || 'N/A'}</p>
              <p className="text-xs text-gray-600 mt-1">Default currency used in financial documents.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Active Document Profile</h3>
          {activeCompany ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
              <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <p><span className="font-medium">Company:</span> {activeCompany.name}</p>
                <p><span className="font-medium">Email:</span> {activeCompany.email}</p>
                <p><span className="font-medium">Phone:</span> {activeCompany.phone || '-'}</p>
                <p><span className="font-medium">Telephone:</span> {activeCompany.telephone || '-'}</p>
                <p><span className="font-medium">WhatsApp:</span> {activeCompany.whatsapp_number || '-'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                <p><span className="font-medium">Address:</span> {activeCompany.address || '-'}</p>
                <p><span className="font-medium">Country:</span> {activeCompany.country || '-'}</p>
                <p><span className="font-medium">Currency:</span> {activeCompany.currency || '-'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4 md:col-span-2">
                <p className="font-medium mb-2">Logo:</p>
                {normalizeLogoUrl(activeCompany) ? (
                  <img src={normalizeLogoUrl(activeCompany)} alt="Company logo" className="h-16 w-auto object-contain rounded border border-gray-200 bg-white p-1" />
                ) : (
                  <p className="text-xs text-gray-500">No logo uploaded.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active company profile selected.</p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            This profile is stored in browser local storage and can be used for invoice headers and printed documents.
          </p>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Accounting Overview</h3>
          {activeCompany ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-700">
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Current Cash Balance</p>
                <p className="text-2xl font-bold text-emerald-800 mt-1">{formatMoney(activeCompany.current_cash_balance)}</p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-4">
                <p className="text-xs uppercase tracking-wide text-sky-700 font-semibold">Current Bank Balance</p>
                <p className="text-2xl font-bold text-sky-800 mt-1">{formatMoney(activeCompany.current_bank_balance)}</p>
                <p className="mt-1 text-xs text-sky-700">Accounts: {activeCompany.bank_accounts?.length || 0}</p>
                {activeCompany.bank_accounts && activeCompany.bank_accounts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {activeCompany.bank_accounts.map((row, index) => (
                      <p key={`${row.bank_name}-${row.account_no}-${index}`} className="text-xs text-sky-700">
                        {row.bank_name} - {row.account_no} ({formatMoney(Number(row.current_balance || 0))})
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4">
                <p className="text-xs uppercase tracking-wide text-violet-700 font-semibold">Current Cheque Account Balance</p>
                <p className="text-2xl font-bold text-violet-800 mt-1">{formatMoney(activeCompany.current_cheque_balance)}</p>
                <p className="mt-1 text-xs text-violet-700">Accounts: {activeCompany.cheque_accounts?.length || 0}</p>
                {activeCompany.cheque_accounts && activeCompany.cheque_accounts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {activeCompany.cheque_accounts.map((row, index) => (
                      <p key={`${row.bank_name}-${row.account_no}-${index}`} className="text-xs text-violet-700">
                        {row.bank_name} - {row.account_no} ({formatMoney(Number(row.current_balance || 0))})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active company profile selected.</p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            These accounting balances are saved in the database with each company profile.
          </p>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-white to-cyan-50">
            <h2 className="text-sm font-semibold text-gray-900">Company Profiles</h2>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Loading company profiles...</div>
          ) : companies.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">No company profiles found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {companies.map((company) => {
                const isActive = Number(company.id) === Number(activeProfileId);
                return (
                  <div key={company.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-cyan-50/40 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{company.name}</p>
                      <p className="text-xs text-gray-600">{company.email}</p>
                      <p className="text-xs text-gray-500">{company.address || '-'} {company.country ? `| ${company.country}` : ''}</p>
                      {normalizeLogoUrl(company) && (
                        <div className="mt-2">
                          <img src={normalizeLogoUrl(company)} alt={`${company.name} logo`} className="h-8 w-auto object-contain rounded border border-gray-200 bg-white p-1" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveCompanyProfile(company)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {isActive ? 'Active Profile' : 'Set Active'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(company)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white shadow-xl p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-red-800">Danger Zone</h3>
              <p className="text-sm text-red-700 mt-1">
                Reset System will clear application data and keep only the current Super Admin account for login.
              </p>
              {resetStatusMessage && (
                <p
                  className={`mt-3 text-xs font-medium ${
                    resetStatusType === 'success' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {resetStatusMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleResetSystem}
              disabled={resettingSystem}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resettingSystem ? 'Resetting...' : 'Reset System'}
            </button>
          </div>
        </section>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4">
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl border border-cyan-100 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-cyan-100/60 via-sky-100/50 to-emerald-100/60 pointer-events-none"></div>
            <div className="relative px-5 py-4 border-b border-cyan-100/80 flex items-center justify-between shrink-0">
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700">Profile Editor</p>
                <h3 className="text-base font-semibold text-gray-900 mt-0.5">
                {editingCompanyId ? 'Edit Company Profile' : 'Create Company Profile'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-8 w-8 rounded-full border border-cyan-200 text-cyan-700 hover:text-cyan-800 hover:bg-cyan-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="relative p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gradient-to-b from-white via-cyan-50/20 to-emerald-50/20 overflow-y-auto overscroll-contain">
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-cyan-700 font-semibold">Mode</p>
                  <p className="text-sm font-semibold text-cyan-900">{editingCompanyId ? 'Update Existing' : 'Create New'}</p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-sky-700 font-semibold">Bank Accounts</p>
                  <p className="text-sm font-semibold text-sky-900">{bankAccounts.length}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-violet-700 font-semibold">Cheque Accounts</p>
                  <p className="text-sm font-semibold text-violet-900">{chequeAccounts.length}</p>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Company Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Telephone</label>
                <input value={telephone} onChange={(e) => setTelephone(e.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp Number</label>
                <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Country</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Currency</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Current Cash Balance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentCashBalance}
                  onChange={(e) => setCurrentCashBalance(e.target.value)}
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50/40 text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="md:col-span-2 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/90 to-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-sky-800 uppercase tracking-wide">Bank Accounts</label>
                  <button type="button" onClick={addBankAccountRow} className="text-xs px-3 py-1.5 rounded-md border border-sky-300 bg-white text-sky-700 hover:bg-sky-100">+ Add Bank</button>
                </div>
                <div className="space-y-2">
                  {bankAccounts.map((row, index) => (
                    <div key={`bank-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white/80 border border-sky-100 rounded-xl p-2.5">
                      <input
                        value={row.bank_name}
                        onChange={(e) => updateBankAccountRow(index, 'bank_name', e.target.value)}
                        placeholder="Bank name"
                        className="md:col-span-4 rounded-md border border-sky-200 text-sm text-black px-2.5 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                      <input
                        value={row.account_no}
                        onChange={(e) => updateBankAccountRow(index, 'account_no', e.target.value)}
                        placeholder="Account no"
                        className="md:col-span-4 rounded-md border border-sky-200 text-sm text-black px-2.5 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.current_balance}
                        onChange={(e) => updateBankAccountRow(index, 'current_balance', e.target.value)}
                        placeholder="Balance"
                        className="md:col-span-3 rounded-md border border-sky-200 text-sm text-black px-2.5 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                      <button type="button" onClick={() => removeBankAccountRow(index)} className="md:col-span-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-xs px-2 py-2 hover:bg-rose-100">Del</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-violet-800 uppercase tracking-wide">Cheque Accounts</label>
                  <button type="button" onClick={addChequeAccountRow} className="text-xs px-3 py-1.5 rounded-md border border-violet-300 bg-white text-violet-700 hover:bg-violet-100">+ Add Cheque</button>
                </div>
                <div className="space-y-2">
                  {chequeAccounts.map((row, index) => (
                    <div key={`cheque-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white/80 border border-violet-100 rounded-xl p-2.5">
                      <input
                        value={row.bank_name}
                        onChange={(e) => updateChequeAccountRow(index, 'bank_name', e.target.value)}
                        placeholder="Bank name"
                        className="md:col-span-4 rounded-md border border-violet-200 text-sm text-black px-2.5 py-2 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      />
                      <input
                        value={row.account_no}
                        onChange={(e) => updateChequeAccountRow(index, 'account_no', e.target.value)}
                        placeholder="Account no"
                        className="md:col-span-4 rounded-md border border-violet-200 text-sm text-black px-2.5 py-2 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.current_balance}
                        onChange={(e) => updateChequeAccountRow(index, 'current_balance', e.target.value)}
                        placeholder="Balance"
                        className="md:col-span-3 rounded-md border border-violet-200 text-sm text-black px-2.5 py-2 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                      />
                      <button type="button" onClick={() => removeChequeAccountRow(index)} className="md:col-span-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-xs px-2 py-2 hover:bg-rose-100">Del</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Website</label>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="w-full rounded-lg border border-cyan-200 bg-white text-sm text-black px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>

              <div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-white p-4">
                <label className="block text-xs font-semibold text-emerald-800 mb-1">Company Logo</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setLogoFile(file);
                    if (file) {
                      const objectUrl = URL.createObjectURL(file);
                      setLogoPreviewValue(objectUrl, true);
                    } else {
                      setLogoPreviewValue(editingCompanyId ? normalizeLogoUrl(activeCompany) : '', false);
                    }
                  }}
                  className="w-full rounded-lg border border-emerald-200 text-sm text-black px-2.5 py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-100 file:px-2.5 file:py-1.5 file:text-emerald-700"
                />
                {logoFile && (
                  <p className="mt-1 text-xs text-emerald-700">Selected file: {logoFile.name}</p>
                )}
                {logoPreview && (
                  <div className="mt-2">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      onError={() => setLogoPreviewError(true)}
                      className="h-16 w-auto object-contain rounded border border-gray-200 bg-white p-1"
                    />
                    {logoPreviewError && (
                      <p className="mt-1 text-xs text-red-600">Unable to preview image. Please choose another file or re-upload.</p>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-emerald-700">Accepted: JPG, PNG, WEBP. Max size: 2MB.</p>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-1 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pb-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-cyan-200 rounded-lg text-sm text-cyan-700 bg-white hover:bg-cyan-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white rounded-lg text-sm font-semibold hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-50 shadow-lg shadow-emerald-200/50 transition-all">
                  {saving ? 'Saving...' : editingCompanyId ? 'Update Profile' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-red-100 bg-gradient-to-r from-red-50 to-white">
              <h3 className="text-sm font-semibold text-red-800">Confirm System Reset</h3>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                This action will clear the database and keep only the Super Admin login account.
              </p>
              <p className="text-xs text-red-700 font-medium">
                Type RESET to confirm.
              </p>
              <input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="w-full rounded-md border border-red-200 text-sm text-black px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              {resetModalError && <p className="text-xs text-red-700">{resetModalError}</p>}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  if (resettingSystem) return;
                  setShowResetModal(false);
                  setResetConfirmText('');
                  setResetModalError('');
                }}
                className="px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSystemReset}
                disabled={resettingSystem}
                className="px-3 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resettingSystem ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-red-100 bg-gradient-to-r from-red-50 to-white">
              <h3 className="text-sm font-semibold text-red-800">{messageModalTitle}</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-700">{messageModalBody}</p>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end bg-gray-50">
              <button
                type="button"
                onClick={() => setShowMessageModal(false)}
                className="px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
