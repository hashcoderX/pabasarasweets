'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApiClient } from '../../../../lib/apiClient';
import { isAxiosError } from '@/lib/http';

type AccountingClassification = 'current_asset' | 'prepaid_asset' | 'deposit_asset' | 'liability';
type EntryType = 'in' | 'out';
type AdvanceType =
  | 'supplier_advance'
  | 'employee_advance'
  | 'travel_advance'
  | 'contractor_advance'
  | 'rent_advance'
  | 'insurance_advance'
  | 'utility_deposit'
  | 'customer_advance';
type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'other';

interface CompanyOption {
  id: number;
  name: string;
}

interface CompanyBankAccountOption {
  id: number;
  company_id: number;
  bank_name: string;
  account_no: string;
  current_balance: number;
}

interface EmployeeOption {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email?: string;
}

interface SupplierOption {
  id: number;
  name: string;
  code?: string;
  contact_person?: string;
}

interface CustomerOption {
  id: number;
  shop_name: string;
  customer_code?: string;
  owner_name?: string;
}

interface ApiCompanyRow {
  id?: number | string;
  name?: string;
  bank_accounts?: ApiBankAccountRow[];
}

interface ApiBankAccountRow {
  id?: number | string;
  bank_name?: string;
  account_no?: string;
  current_balance?: number | string;
}

interface ApiEmployeeRow {
  id?: number | string;
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface ApiSupplierRow {
  id?: number | string;
  name?: string;
  code?: string;
  contact_person?: string;
}

interface ApiCustomerRow {
  id?: number | string;
  shop_name?: string;
  customer_code?: string;
  owner_name?: string;
}

interface AdvancePaymentRecord {
  id: number;
  date: string;
  advance_type: AdvanceType;
  accounting_classification: AccountingClassification;
  entry_type: EntryType;
  amount: number;
  beneficiary_name: string;
  payment_method: PaymentMethod;
  company_id?: number | null;
  company_bank_account_id?: number | null;
  reference?: string | null;
  note?: string | null;
  company?: { id: number; name: string } | null;
  company_bank_account?: { id: number; bank_name: string; account_no: string } | null;
}

const ADVANCE_TYPE_META: Array<{
  value: AdvanceType;
  label: string;
  example: string;
  classification: AccountingClassification;
  entryType: EntryType;
}> = [
  { value: 'supplier_advance', label: 'Supplier Advance', example: 'Advance for raw materials', classification: 'current_asset', entryType: 'out' },
  { value: 'employee_advance', label: 'Employee Advance', example: 'Money given to employee', classification: 'current_asset', entryType: 'out' },
  { value: 'travel_advance', label: 'Travel Advance', example: 'Money for business travel', classification: 'current_asset', entryType: 'out' },
  { value: 'contractor_advance', label: 'Contractor Advance', example: 'Advance for construction', classification: 'current_asset', entryType: 'out' },
  { value: 'rent_advance', label: 'Rent Advance', example: 'Advance rent payment', classification: 'prepaid_asset', entryType: 'out' },
  { value: 'insurance_advance', label: 'Insurance Advance', example: 'Annual insurance payment', classification: 'prepaid_asset', entryType: 'out' },
  { value: 'utility_deposit', label: 'Utility Deposit', example: 'Refundable electricity deposit', classification: 'deposit_asset', entryType: 'out' },
  { value: 'customer_advance', label: 'Customer Advance', example: 'Money received before delivery', classification: 'liability', entryType: 'in' },
];

const CLASS_LABELS: Record<AccountingClassification, string> = {
  current_asset: 'Current Asset',
  prepaid_asset: 'Prepaid Asset',
  deposit_asset: 'Deposit Asset',
  liability: 'Liability',
};

const ENTRY_LABELS: Record<EntryType, string> = {
  in: 'Money In',
  out: 'Money Out',
};

export default function AdvancePaymentsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AdvancePaymentRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccountOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [advanceType, setAdvanceType] = useState<AdvanceType>('supplier_advance');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [companyId, setCompanyId] = useState('');
  const [companyBankAccountId, setCompanyBankAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<'all' | AccountingClassification>('all');

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  const selectedTypeMeta = useMemo(
    () => ADVANCE_TYPE_META.find((item) => item.value === advanceType) || ADVANCE_TYPE_META[0],
    [advanceType]
  );

  const filteredBankAccounts = useMemo(() => {
    if (!companyId) return bankAccounts;
    return bankAccounts.filter((item) => item.company_id === Number(companyId));
  }, [bankAccounts, companyId]);

  const selectedBankAccount = useMemo(
    () => filteredBankAccounts.find((account) => account.id === Number(companyBankAccountId)) || null,
    [filteredBankAccounts, companyBankAccountId]
  );

  const employeeNameSuggestions = useMemo(() => {
    const term = beneficiaryName.trim().toLowerCase();
    const rows = employees.map((employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`.trim();
      return {
        id: employee.id,
        label: employee.employee_code ? `${fullName} (${employee.employee_code})` : fullName,
      };
    });

    if (!term) return rows.slice(0, 20);
    return rows.filter((row) => row.label.toLowerCase().includes(term)).slice(0, 20);
  }, [employees, beneficiaryName]);

  const supplierNameSuggestions = useMemo(() => {
    const term = beneficiaryName.trim().toLowerCase();
    const rows = suppliers.map((supplier) => ({
      id: supplier.id,
      label: supplier.code ? `${supplier.name} (${supplier.code})` : supplier.name,
    }));

    if (!term) return rows.slice(0, 20);
    return rows.filter((row) => row.label.toLowerCase().includes(term)).slice(0, 20);
  }, [suppliers, beneficiaryName]);

  const customerNameSuggestions = useMemo(() => {
    const term = beneficiaryName.trim().toLowerCase();
    const rows = customers.map((customer) => ({
      id: customer.id,
      label: customer.customer_code
        ? `${customer.shop_name} (${customer.customer_code})`
        : customer.shop_name,
    }));

    if (!term) return rows.slice(0, 20);
    return rows.filter((row) => row.label.toLowerCase().includes(term)).slice(0, 20);
  }, [customers, beneficiaryName]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      const classificationMatches =
        classificationFilter === 'all' || record.accounting_classification === classificationFilter;
      const searchMatches =
        !term ||
        [record.beneficiary_name, record.reference, record.note]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return classificationMatches && searchMatches;
    });
  }, [records, search, classificationFilter]);

  const netAdvanceBalance = useMemo(() => {
    return filteredRecords.reduce((sum, record) => {
      const amountValue = Number(record.amount || 0);
      return record.entry_type === 'out' ? sum + amountValue : sum - amountValue;
    }, 0);
  }, [filteredRecords]);

  const fetchRecords = async () => {
    try {
      const response = await api.get('/advance-payments');
      const rows = response.data?.data?.data ?? response.data?.data ?? [];
      setRecords(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to fetch advance payments:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/companies');
      const rows = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      const companyRows: ApiCompanyRow[] = Array.isArray(rows) ? rows : [];
      const normalizedCompanies: CompanyOption[] = companyRows
        .map((company) => ({
          id: Number(company?.id || 0),
          name: String(company?.name || 'Company'),
        }))
        .filter((company: CompanyOption) => company.id > 0);

      const normalizedBankAccounts: CompanyBankAccountOption[] = companyRows.flatMap((company) => {
        const accounts = Array.isArray(company?.bank_accounts) ? company.bank_accounts : [];
        return accounts.map((account) => ({
          id: Number(account?.id || 0),
          company_id: Number(company?.id || 0),
          bank_name: String(account?.bank_name || ''),
          account_no: String(account?.account_no || ''),
          current_balance: Number(account?.current_balance || 0),
        }));
      }).filter((account: CompanyBankAccountOption) => account.id > 0);

      setBankAccounts(normalizedBankAccounts);
      setCompanyId((prev) => prev || (normalizedCompanies[0] ? String(normalizedCompanies[0].id) : ''));
    } catch (error) {
      console.error('Failed to fetch company options:', error);
      setBankAccounts([]);
    }
  };

  const fetchEmployees = async () => {
    try {
      setEmployeesLoading(true);
      const response = await api.get('/hr/employees');
      const rows = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      const employeeRows: ApiEmployeeRow[] = Array.isArray(rows) ? rows : [];
      const normalized: EmployeeOption[] = employeeRows
        .map((employee) => ({
          id: Number(employee?.id || 0),
          employee_code: String(employee?.employee_code || ''),
          first_name: String(employee?.first_name || ''),
          last_name: String(employee?.last_name || ''),
          email: employee?.email ? String(employee.email) : undefined,
        }))
        .filter((employee: EmployeeOption) => employee.id > 0);
      setEmployees(normalized);
    } catch (error) {
      console.error('Failed to fetch employee suggestions:', error);
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      setSuppliersLoading(true);
      const response = await api.get('/stock/suppliers', { params: { per_page: 1000 } });
      const payload = response.data;
      const rows = payload?.data?.data || payload?.data || [];
      const supplierRows: ApiSupplierRow[] = Array.isArray(rows) ? rows : [];
      const normalized: SupplierOption[] = supplierRows
        .map((supplier) => ({
          id: Number(supplier?.id || 0),
          name: String(supplier?.name || '').trim(),
          code: supplier?.code ? String(supplier.code) : undefined,
          contact_person: supplier?.contact_person ? String(supplier.contact_person) : undefined,
        }))
        .filter((supplier) => supplier.id > 0 && supplier.name.length > 0);
      setSuppliers(normalized);
    } catch (error) {
      console.error('Failed to fetch supplier suggestions:', error);
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
      const response = await api.get('/distribution/customers', { params: { per_page: 1000 } });
      const payload = response.data;
      const rows = payload?.data?.data || payload?.data || [];
      const customerRows: ApiCustomerRow[] = Array.isArray(rows) ? rows : [];
      const normalized: CustomerOption[] = customerRows
        .map((customer) => ({
          id: Number(customer?.id || 0),
          shop_name: String(customer?.shop_name || '').trim(),
          customer_code: customer?.customer_code ? String(customer.customer_code) : undefined,
          owner_name: customer?.owner_name ? String(customer.owner_name) : undefined,
        }))
        .filter((customer) => customer.id > 0 && customer.shop_name.length > 0);
      setCustomers(normalized);
    } catch (error) {
      console.error('Failed to fetch customer suggestions:', error);
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
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
    fetchRecords();
    fetchCompanies();
  }, [token]);

  useEffect(() => {
    if (!token || advanceType !== 'employee_advance' || employees.length > 0) return;
    fetchEmployees();
  }, [token, advanceType, employees.length]);

  useEffect(() => {
    if (!token || advanceType !== 'supplier_advance' || suppliers.length > 0) return;
    fetchSuppliers();
  }, [token, advanceType, suppliers.length]);

  useEffect(() => {
    if (!token || advanceType !== 'customer_advance' || customers.length > 0) return;
    fetchCustomers();
  }, [token, advanceType, customers.length]);

  useEffect(() => {
    if (paymentMethod !== 'bank_transfer') {
      setCompanyBankAccountId('');
      return;
    }
    const valid = filteredBankAccounts.some((account) => account.id === Number(companyBankAccountId));
    if (!valid) {
      setCompanyBankAccountId(filteredBankAccounts[0] ? String(filteredBankAccounts[0].id) : '');
    }
  }, [paymentMethod, filteredBankAccounts, companyBankAccountId]);

  const resetForm = () => {
    setAdvanceType('supplier_advance');
    setDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setBeneficiaryName('');
    setPaymentMethod('cash');
    setCompanyBankAccountId('');
    setReference('');
    setNote('');
  };

  const submitRecord = async () => {
    const amountValue = Number(amount || 0);
    if (!date || !beneficiaryName.trim() || amountValue <= 0) {
      setErrorMessage('Date, payee/party name, and valid amount are required.');
      return;
    }

    if (paymentMethod === 'bank_transfer' && !companyBankAccountId) {
      setErrorMessage('Select a company bank account for bank transfer.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage('');
      await api.post('/advance-payments', {
        date,
        advance_type: advanceType,
        amount: amountValue,
        beneficiary_name: beneficiaryName.trim(),
        payment_method: paymentMethod,
        company_id: companyId ? Number(companyId) : null,
        company_bank_account_id: paymentMethod === 'bank_transfer' ? Number(companyBankAccountId) : null,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      await fetchRecords();
      resetForm();
    } catch (error) {
      if (isAxiosError(error)) {
        const firstError = Object.values(error.response?.data?.errors || {})?.[0] as string[] | undefined;
        setErrorMessage(firstError?.[0] || error.response?.data?.message || 'Failed to record advance payment.');
      } else {
        setErrorMessage('Failed to record advance payment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async (id: number) => {
    try {
      await api.delete(`/advance-payments/${id}`);
      setRecords((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      console.error('Failed to delete advance payment:', error);
    }
  };

  const fieldClassName =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100';

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#f0fdfa_0%,_#ecfeff_55%,_#f8fafc_100%)]">
      <div className="w-full py-8 px-3 sm:px-4 lg:px-6 space-y-6">
        <div className="rounded-[30px] border border-white/80 bg-white/90 shadow-[0_32px_90px_-40px_rgba(8,145,178,0.6)] p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                <span className="h-2 w-2 rounded-full bg-cyan-500" />
                Accounts
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Advance Payments</h1>
              <p className="mt-2 text-sm text-slate-600">Manage supplier, employee, travel, contractor, rent, insurance, utility, and customer advances.</p>
            </div>
            <Link href="/dashboard/accounts" className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-50">← Back to Accounts</Link>
          </div>
        </div>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-2xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-cyan-100/40 space-y-4">
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">Record Advance Payment</h2>
              <p className="text-sm text-slate-500">Post a new advance transaction with the correct accounting class and source details.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClassName} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Advance Type *</label>
                <select value={advanceType} onChange={(e) => setAdvanceType(e.target.value as AdvanceType)} className={fieldClassName}>
                  {ADVANCE_TYPE_META.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Party / Employee / Supplier *</label>
                <input
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  className={fieldClassName}
                  placeholder={
                    advanceType === 'employee_advance'
                      ? 'Search employee name...'
                      : advanceType === 'supplier_advance'
                        ? 'Search supplier name...'
                        : advanceType === 'customer_advance'
                          ? 'Search customer name...'
                        : 'Enter name'
                  }
                  list={
                    advanceType === 'employee_advance'
                      ? 'employee-beneficiary-options'
                      : advanceType === 'supplier_advance'
                        ? 'supplier-beneficiary-options'
                        : advanceType === 'customer_advance'
                          ? 'customer-beneficiary-options'
                        : undefined
                  }
                />
                {advanceType === 'employee_advance' && (
                  <>
                    <datalist id="employee-beneficiary-options">
                      {employeeNameSuggestions.map((employee) => (
                        <option key={employee.id} value={employee.label} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-xs text-gray-500">
                      {employeesLoading ? 'Loading employees...' : 'Type to search registered employees.'}
                    </p>
                  </>
                )}
                {advanceType === 'supplier_advance' && (
                  <>
                    <datalist id="supplier-beneficiary-options">
                      {supplierNameSuggestions.map((supplier) => (
                        <option key={supplier.id} value={supplier.label} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-xs text-gray-500">
                      {suppliersLoading ? 'Loading suppliers...' : 'Type to search registered suppliers.'}
                    </p>
                  </>
                )}
                {advanceType === 'customer_advance' && (
                  <>
                    <datalist id="customer-beneficiary-options">
                      {customerNameSuggestions.map((customer) => (
                        <option key={customer.id} value={customer.label} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-xs text-gray-500">
                      {customersLoading ? 'Loading customers...' : 'Type to search registered customers.'}
                    </p>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClassName} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={fieldClassName}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {paymentMethod === 'bank_transfer' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Bank Account *</label>
                  <select value={companyBankAccountId} onChange={(e) => setCompanyBankAccountId(e.target.value)} className={fieldClassName}>
                    <option value="">Select Bank Account</option>
                    {filteredBankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.bank_name} - {account.account_no} (Balance: {Number(account.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </option>
                    ))}
                  </select>
                  {selectedBankAccount && (
                    <p className="mt-1 text-xs text-cyan-700">
                      Available balance: {Number(selectedBankAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClassName} placeholder="Voucher / transaction ref" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldClassName} placeholder="Optional note" />
              </div>
            </div>

            <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm">
              <span className="font-semibold text-cyan-900">Classification:</span> <span className="text-cyan-800">{CLASS_LABELS[selectedTypeMeta.classification]}</span>
              <span className="mx-2 text-cyan-400">|</span>
              <span className="font-semibold text-cyan-900">Entry:</span> <span className="text-cyan-800">{ENTRY_LABELS[selectedTypeMeta.entryType]}</span>
            </div>

            {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{errorMessage}</div>}

            <div className="flex justify-end">
              <button onClick={submitRecord} disabled={submitting} className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-200 transition hover:-translate-y-0.5 hover:from-cyan-700 hover:to-teal-700 disabled:transform-none disabled:opacity-60">
                {submitting ? 'Saving...' : 'Record Advance'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/50 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Advance Summary</h3>
            <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-teal-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Net Advance Exposure</p>
              <p className="text-2xl font-bold text-cyan-900">{netAdvanceBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-slate-500 mt-1">Outflows minus customer advance receipts</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Records</p>
              <p className="text-xl font-semibold text-slate-900">{filteredRecords.length}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/50">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Advance Payment Register</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by party or reference..." className={fieldClassName} />
              <select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value as 'all' | AccountingClassification)} className={fieldClassName}>
                <option value="all">All Classifications</option>
                <option value="current_asset">Current Asset</option>
                <option value="prepaid_asset">Prepaid Asset</option>
                <option value="deposit_asset">Deposit Asset</option>
                <option value="liability">Liability</option>
              </select>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1150px] w-full bg-white">
              <thead className="bg-slate-50/90">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Party</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Class</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Entry</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700 uppercase">Amount</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Payment</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Reference</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((row, index) => (
                  <tr key={row.id} className={`border-b border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-3 py-2 text-sm text-slate-700">{row.date}</td>
                    <td className="px-3 py-2 text-sm text-slate-900">{ADVANCE_TYPE_META.find((item) => item.value === row.advance_type)?.label || row.advance_type}</td>
                    <td className="px-3 py-2 text-sm text-slate-900">{row.beneficiary_name}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {CLASS_LABELS[row.accounting_classification]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.entry_type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {ENTRY_LABELS[row.entry_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      <span className="inline-flex rounded-full bg-cyan-50 px-2 py-1 text-xs font-medium capitalize text-cyan-700">
                        {row.payment_method.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">{row.reference || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => deleteRecord(row.id)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100">Delete</button>
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">No advance payment records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

