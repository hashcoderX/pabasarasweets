'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface Payroll {
  id: number;
  branch_id?: number;
  employee_id: number;
  month_year: string;
  basic_salary: number;
  earned_basic_salary?: number;
  allowances: number;
  deductions: number;
  commission_amount?: number;
  attendance_deduction_amount?: number;
  late_hours?: number;
  late_deduction_amount?: number;
  epf_employee_amount?: number;
  epf_employer_amount?: number;
  etf_employee_amount?: number;
  etf_employer_amount?: number;
  gross_salary?: number;
  apit_tax_amount?: number;
  net_salary: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  overtime_hours: number;
  overtime_amount: number;
  salary_breakdown?: {
    custom_allowance_items?: Array<{
      id: number;
      name: string;
      amount: number;
      amount_type: 'fixed' | 'percentage';
      raw_amount: number;
    }>;
    custom_deduction_items?: Array<{
      id: number;
      name: string;
      amount: number;
      amount_type: 'fixed' | 'percentage';
      raw_amount: number;
    }>;
    custom_allowances_total?: number;
    custom_deductions_total?: number;
    basic_salary: number;
    earned_basic_salary: number;
    commission_amount: number;
    overtime_hours: number;
    overtime_amount: number;
    attendance_deduction_amount: number;
    late_hours: number;
    late_deduction_amount: number;
    epf_employee_amount: number;
    epf_employer_amount: number;
    etf_employee_amount: number;
    etf_employer_amount: number;
    apit_tax_amount: number;
    allowances: number;
    deductions: number;
    gross_salary: number;
    net_salary: number;
  };
  status: 'pending' | 'processed' | 'paid';
  processed_at?: string;
  employee: {
    id: number;
    employee_code: string;
    first_name: string;
    last_name: string;
    email: string;
    department?: { id: number; name: string } | null;
    designation?: { id: number; name: string } | null;
  };
}

interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  basic_salary: number;
  department: { id: number; name: string };
  designation: { id: number; name: string };
}

interface Branch {
  id: number;
  name: string;
  currency?: string;
}

export default function Payroll() {
  const [token, setToken] = useState('');
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const router = useRouter();

  // Generate payroll form fields
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [recalculateLoading, setRecalculateLoading] = useState(false);
  const [bulkProcessLoading, setBulkProcessLoading] = useState(false);

  // Filter states
  const [filterMonth, setFilterMonth] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void> | void) | null>(null);

  // Notice modal state
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error' | 'warning' | 'info'>('info');

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchPayrolls(storedToken);
      fetchEmployees(storedToken);
      fetchBranches(storedToken);
    }
  }, [router]);

  const fetchPayrolls = async (authToken: string) => {
    try {
      setLoading(true);
      const params: { month_year?: string; branch_id?: string } = {};
      if (filterMonth) params.month_year = filterMonth;
      if (filterBranch) params.branch_id = filterBranch;

      const response = await axios.get('/api/hr/payrolls', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { ...params, per_page: 1000 }
      });

      const payrollsData = response.data.data || response.data;
      setPayrolls(Array.isArray(payrollsData) ? payrollsData : []);
    } catch (error) {
      console.error('Error fetching payrolls:', error);
      setPayrolls([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async (authToken: string) => {
    try {
      const response = await axios.get('/api/hr/employees', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { per_page: 1000 }
      });

      const employeesData = response.data.data || response.data;
      setEmployees(Array.isArray(employeesData) ? employeesData : []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    }
  };

  const fetchBranches = async (authToken: string) => {
    try {
      const response = await axios.get('/api/companies', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { per_page: 1000 }
      });

      const branchesData = response.data.data || response.data;
      setBranches(Array.isArray(branchesData) ? branchesData : []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      setBranches([]);
    }
  };

  const executeGeneratePayroll = async () => {
    if (!token || !selectedBranch || !selectedMonth) return;

    try {
      setGenerateLoading(true);

      const response = await axios.post('/api/hr/payrolls/generate', {
        branch_id: parseInt(selectedBranch),
        month_year: selectedMonth,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setShowGenerateModal(false);
      setSelectedBranch('');
      setSelectedMonth('');
      fetchPayrolls(token);

      // Show success message
      showNotice('Success', `Payroll generated successfully for ${response.data.payrolls.length} employees!`, 'success');
    } catch (error) {
      console.error('Error generating payroll:', error);
      showNotice('Error', 'Failed to generate payroll. Please try again.', 'error');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleGeneratePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedBranch || !selectedMonth) return;

    openConfirm(
      'Generate Payroll',
      `Generate payroll for ${selectedMonth} in selected branch? Existing records for the month will not be regenerated by this action.`,
      async () => {
        await executeGeneratePayroll();
      }
    );
  };

  const executeStatusUpdate = async (payrollId: number, newStatus: 'pending' | 'processed' | 'paid') => {
    if (!token) return;

    try {
      await axios.put(`/api/hr/payrolls/${payrollId}`, {
        status: newStatus,
        processed_at: newStatus === 'processed' ? new Date().toISOString().split('T')[0] : null,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      fetchPayrolls(token);
      showNotice('Success', `Payroll status updated to ${newStatus}!`, 'success');
    } catch (error) {
      console.error('Error updating payroll status:', error);
      showNotice('Error', 'Failed to update payroll status.', 'error');
    }
  };

  const handleStatusUpdate = (payrollId: number, newStatus: 'pending' | 'processed' | 'paid') => {
    openConfirm(
      'Confirm Status Change',
      `Are you sure you want to set this payroll status to "${newStatus}"?`,
      async () => {
        await executeStatusUpdate(payrollId, newStatus);
      }
    );
  };

  const executeProcessAllSalaries = async () => {
    if (!token) return;

    const pendingRows = filteredPayrolls.filter((payroll) => payroll.status === 'pending');
    if (pendingRows.length === 0) {
      showNotice('Info', 'No pending salaries found for current filters.', 'info');
      return;
    }

    try {
      setBulkProcessLoading(true);

      const today = new Date().toISOString().split('T')[0];
      const chunkSize = 25;
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < pendingRows.length; i += chunkSize) {
        const chunk = pendingRows.slice(i, i + chunkSize);
        const results = await Promise.allSettled(
          chunk.map((payroll) =>
            axios.put(
              `/api/hr/payrolls/${payroll.id}`,
              { status: 'processed', processed_at: today },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            successCount += 1;
          } else {
            failedCount += 1;
          }
        });
      }

      await fetchPayrolls(token);

      if (failedCount === 0) {
        showNotice('Success', `Processed ${successCount} salaries successfully.`, 'success');
      } else {
        showNotice('Warning', `Processed ${successCount} salaries. Failed: ${failedCount}.`, 'warning');
      }
    } catch (error) {
      console.error('Error processing all salaries:', error);
      showNotice('Error', 'Failed to process salaries in bulk.', 'error');
    } finally {
      setBulkProcessLoading(false);
    }
  };

  const handleProcessAllSalaries = () => {
    if (!token) return;

    const pendingRows = filteredPayrolls.filter((payroll) => payroll.status === 'pending');
    if (pendingRows.length === 0) {
      showNotice('Info', 'No pending salaries found for current filters.', 'info');
      return;
    }

    openConfirm(
      'Process All Salaries',
      `Process ${pendingRows.length} pending salaries from current filtered list? This will set status to "processed" for all of them.`,
      async () => {
        await executeProcessAllSalaries();
      }
    );
  };

  const executeRecalculatePayroll = async () => {
    if (!token || !filterMonth) {
      showNotice('Validation', 'Please select Month/Year before recalculation.', 'warning');
      return;
    }

    try {
      setRecalculateLoading(true);
      const payload: { month_year: string; branch_id?: number } = {
        month_year: filterMonth,
      };

      if (filterBranch) {
        payload.branch_id = parseInt(filterBranch, 10);
      }

      const response = await axios.post('/api/hr/payrolls/recalculate', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const summary = response.data?.summary;
      fetchPayrolls(token);
      showNotice(
        'Success',
        `Recalculation completed. Created: ${summary?.created ?? 0}, Updated: ${summary?.updated ?? 0}, Skipped Paid: ${summary?.skipped_paid ?? 0}`,
        'success'
      );
    } catch (error) {
      console.error('Error recalculating payroll:', error);
      showNotice('Error', 'Failed to recalculate payroll. Please check month/branch and try again.', 'error');
    } finally {
      setRecalculateLoading(false);
    }
  };

  const handleRecalculatePayroll = () => {
    if (!token || !filterMonth) {
      showNotice('Validation', 'Please select Month/Year before recalculation.', 'warning');
      return;
    }

    openConfirm(
      'Recalculate Payroll',
      `Recalculate payroll for ${filterMonth}? This updates generated records and keeps paid ones unchanged.`,
      async () => {
        await executeRecalculatePayroll();
      }
    );
  };

  const handleViewPayslip = (payroll: Payroll) => {
    setSelectedPayroll(payroll);
    setShowPayslipModal(true);
  };

  const handleDownloadPayslip = async (payroll: Payroll) => {
    if (!token) return;

    try {
      const response = await axios.get(`/api/hr/payrolls/${payroll.id}/payslip`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payslip_${payroll.employee.employee_code}_${payroll.month_year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading payslip:', error);
      showNotice('Error', 'Failed to download payslip.', 'error');
    }
  };

  const showNotice = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setNoticeTitle(title);
    setNoticeMessage(message);
    setNoticeType(type);
    setNoticeOpen(true);
  };

  const openConfirm = (title: string, message: string, onConfirm: () => Promise<void> | void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => onConfirm);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTitle('');
    setConfirmMessage('');
    setConfirmAction(null);
  };

  const closeNotice = () => {
    setNoticeOpen(false);
    setNoticeTitle('');
    setNoticeMessage('');
    setNoticeType('info');
  };

  const resetFilters = () => {
    setFilterMonth('');
    setFilterBranch('');
    setFilterStatus('');
    if (token) fetchPayrolls(token);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processed': return 'bg-blue-100 text-blue-800';
      case 'paid': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const normalizeCurrency = (raw?: string) => {
    const code = String(raw || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'USD';
  };

  const resolveBranchCurrency = (branchId?: string | number) => {
    if (!branchId) return undefined;
    const branch = branches.find((row) => String(row.id) === String(branchId));
    return normalizeCurrency(branch?.currency);
  };

  const activeCurrency = resolveBranchCurrency(filterBranch || selectedBranch) || normalizeCurrency(branches[0]?.currency);

  const formatCurrency = (amount: number, currencyCode?: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrency(currencyCode || activeCurrency)
    }).format(amount);
  };

  const getBreakdownValue = (payroll: Payroll, key: keyof NonNullable<Payroll['salary_breakdown']>, fallback = 0) => {
    if (payroll.salary_breakdown && typeof payroll.salary_breakdown[key] === 'number') {
      return payroll.salary_breakdown[key] as number;
    }

    const topLevelValues: Partial<Record<keyof NonNullable<Payroll['salary_breakdown']>, number | undefined>> = {
      basic_salary: payroll.basic_salary,
      earned_basic_salary: payroll.earned_basic_salary,
      commission_amount: payroll.commission_amount,
      overtime_hours: payroll.overtime_hours,
      overtime_amount: payroll.overtime_amount,
      attendance_deduction_amount: payroll.attendance_deduction_amount,
      late_hours: payroll.late_hours,
      late_deduction_amount: payroll.late_deduction_amount,
      epf_employee_amount: payroll.epf_employee_amount,
      epf_employer_amount: payroll.epf_employer_amount,
      etf_employee_amount: payroll.etf_employee_amount,
      etf_employer_amount: payroll.etf_employer_amount,
      apit_tax_amount: payroll.apit_tax_amount,
      allowances: payroll.allowances,
      deductions: payroll.deductions,
      gross_salary: payroll.gross_salary,
      net_salary: payroll.net_salary,
      custom_allowances_total: undefined,
      custom_deductions_total: undefined,
      custom_allowance_items: undefined,
      custom_deduction_items: undefined,
    };

    const topLevel = topLevelValues[key];
    return typeof topLevel === 'number' ? topLevel : fallback;
  };

  const filteredPayrolls = payrolls.filter((payroll) => !filterStatus || payroll.status === filterStatus);
  const totalNetPayroll = filteredPayrolls.reduce((sum, payroll) => sum + (Number(payroll.net_salary) || 0), 0);
  const pendingCount = filteredPayrolls.filter((payroll) => payroll.status === 'pending').length;
  const processedCount = filteredPayrolls.filter((payroll) => payroll.status === 'processed').length;
  const paidCount = filteredPayrolls.filter((payroll) => payroll.status === 'paid').length;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-sky-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute top-32 right-0 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 bg-white/80 backdrop-blur-xl shadow-lg border-b border-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-semibold mb-3">
                HRM Payroll Center
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">Payroll Management</h1>
              <p className="text-sm sm:text-base md:text-lg text-slate-600 mt-2">Accurate salary processing with attendance, overtime, deductions, EPF/ETF, and APIT in one place.</p>
            </div>
            <div className="md:flex-shrink-0">
              <button
                onClick={() => setShowGenerateModal(true)}
                className="w-full md:w-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-7 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-[1.02] shadow-xl"
              >
                Generate Payroll
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-7">
            <div className="rounded-2xl border border-cyan-100 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold text-cyan-700 uppercase tracking-wide">Payroll Rows</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{filteredPayrolls.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Total Net Salary</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(totalNetPayroll, activeCurrency)}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Pending</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Processed / Paid</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{processedCount} / {paidCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white/85 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Filter & Recalculate</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Smart Controls</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month/Year</label>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              >
                <option value="">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="processed">Processed</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="md:col-span-4 flex flex-wrap items-end gap-2 pt-1">
              <button
                onClick={() => token && fetchPayrolls(token)}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 shadow"
              >
                Apply Filters
              </button>
              <button
                onClick={handleRecalculatePayroll}
                disabled={recalculateLoading}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 shadow"
              >
                {recalculateLoading ? 'Recalculating...' : 'Recalculate Month'}
              </button>
              <button
                onClick={handleProcessAllSalaries}
                disabled={bulkProcessLoading}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 shadow"
              >
                {bulkProcessLoading ? 'Processing All...' : 'Process All Salaries'}
              </button>
              <button
                onClick={resetFilters}
                className="bg-slate-500 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-cyan-900 to-blue-900 px-6 py-4">
            <h3 className="text-white text-lg font-bold">Payroll Ledger</h3>
            <p className="text-cyan-100 text-sm">Review salary computations, statuses, and employee-wise payouts.</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Month/Year
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Basic Salary
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Allowances
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deductions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Salary
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayrolls.map((payroll) => (
                    <tr key={payroll.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {payroll.employee.first_name} {payroll.employee.last_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {payroll.employee.employee_code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payroll.month_year}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payroll.basic_salary, resolveBranchCurrency(payroll.branch_id) || activeCurrency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payroll.allowances, resolveBranchCurrency(payroll.branch_id) || activeCurrency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payroll.deductions, resolveBranchCurrency(payroll.branch_id) || activeCurrency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(payroll.net_salary, resolveBranchCurrency(payroll.branch_id) || activeCurrency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(payroll.status)}`}>
                          {payroll.status.charAt(0).toUpperCase() + payroll.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2 items-center">
                          <button
                            onClick={() => handleViewPayslip(payroll)}
                            className="text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadPayslip(payroll)}
                            className="text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-md"
                          >
                            Download
                          </button>
                          {payroll.status === 'pending' && (
                            <button
                              onClick={() => handleStatusUpdate(payroll.id, 'processed')}
                              className="text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-3 py-1 rounded-md"
                            >
                              Process
                            </button>
                          )}
                          {payroll.status === 'processed' && (
                            <button
                              onClick={() => handleStatusUpdate(payroll.id, 'paid')}
                              className="text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-3 py-1 rounded-md"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPayrolls.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-500">No payroll records found for the selected filters.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Generate Payroll Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Generate Payroll</h3>
            </div>
            <form onSubmit={handleGeneratePayroll} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  required
                >
                  <option value="">Select Branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Month/Year</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  required
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generateLoading}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
                >
                  {generateLoading ? 'Generating...' : 'Generate Payroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {showPayslipModal && selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Employee Payslip</h3>
            </div>
            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-black">Employee Details</h4>
                    <p className="text-sm text-black">Name: {selectedPayroll.employee.first_name} {selectedPayroll.employee.last_name}</p>
                    <p className="text-sm text-black">Code: {selectedPayroll.employee.employee_code}</p>
                    <p className="text-sm text-black">Department: {selectedPayroll.employee.department?.name || 'Not Assigned'}</p>
                    <p className="text-sm text-black">Designation: {selectedPayroll.employee.designation?.name || 'Not Assigned'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-black">Payroll Details</h4>
                    <p className="text-sm text-black">Month/Year: {selectedPayroll.month_year}</p>
                    <p className="text-sm text-black">Status: <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedPayroll.status)}`}>{selectedPayroll.status}</span></p>
                    <p className="text-sm text-black">Working Days: {selectedPayroll.working_days}</p>
                    <p className="text-sm text-black">Present Days: {selectedPayroll.present_days}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-black mb-4">Salary Breakdown</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Basic Salary:</span>
                      <span className="text-sm font-medium text-black">{formatCurrency(selectedPayroll.basic_salary, resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Earned Basic (Attendance):</span>
                      <span className="text-sm font-medium text-black">{formatCurrency(getBreakdownValue(selectedPayroll, 'earned_basic_salary', selectedPayroll.basic_salary), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Commission:</span>
                      <span className="text-sm font-medium text-green-600">+{formatCurrency(getBreakdownValue(selectedPayroll, 'commission_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Overtime:</span>
                      <span className="text-sm font-medium text-green-600">+{formatCurrency(getBreakdownValue(selectedPayroll, 'overtime_amount', selectedPayroll.overtime_amount || 0), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Custom Allowances:</span>
                      <span className="text-sm font-medium text-green-600">+{formatCurrency(getBreakdownValue(selectedPayroll, 'custom_allowances_total'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    {(selectedPayroll.salary_breakdown?.custom_allowance_items || []).map((item) => (
                      <div key={`allowance-${item.id}`} className="flex justify-between text-xs text-green-700">
                        <span>
                          {item.name}
                          {item.amount_type === 'percentage' ? ` (${item.raw_amount}% of earned basic)` : ''}
                        </span>
                        <span>+{formatCurrency(item.amount, resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Overtime Hours:</span>
                      <span>{getBreakdownValue(selectedPayroll, 'overtime_hours', selectedPayroll.overtime_hours || 0).toFixed(2)} h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Allowances:</span>
                      <span className="text-sm font-medium text-green-600">+{formatCurrency(selectedPayroll.allowances, resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Attendance Deduction:</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(getBreakdownValue(selectedPayroll, 'attendance_deduction_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Late Deduction:</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(getBreakdownValue(selectedPayroll, 'late_deduction_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Late Hours:</span>
                      <span>{getBreakdownValue(selectedPayroll, 'late_hours').toFixed(2)} h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">EPF (Employee):</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(getBreakdownValue(selectedPayroll, 'epf_employee_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">ETF (Employee):</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(getBreakdownValue(selectedPayroll, 'etf_employee_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">APIT Tax:</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(getBreakdownValue(selectedPayroll, 'apit_tax_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Custom Deductions:</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(getBreakdownValue(selectedPayroll, 'custom_deductions_total'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    {(selectedPayroll.salary_breakdown?.custom_deduction_items || []).map((item) => (
                      <div key={`deduction-${item.id}`} className="flex justify-between text-xs text-red-700">
                        <span>
                          {item.name}
                          {item.amount_type === 'percentage' ? ` (${item.raw_amount}% of earned basic)` : ''}
                        </span>
                        <span>-{formatCurrency(item.amount, resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>EPF (Employer):</span>
                      <span>{formatCurrency(getBreakdownValue(selectedPayroll, 'epf_employer_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>ETF (Employer):</span>
                      <span>{formatCurrency(getBreakdownValue(selectedPayroll, 'etf_employer_amount'), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Deductions:</span>
                      <span className="text-sm font-medium text-red-600">-{formatCurrency(selectedPayroll.deductions, resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-black">Gross Salary:</span>
                      <span className="text-sm font-medium text-black">{formatCurrency(getBreakdownValue(selectedPayroll, 'gross_salary', (selectedPayroll.basic_salary || 0) + (selectedPayroll.allowances || 0)), resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-lg font-semibold text-black">Net Salary:</span>
                      <span className="text-lg font-bold text-blue-600">{formatCurrency(selectedPayroll.net_salary, resolveBranchCurrency(selectedPayroll.branch_id) || activeCurrency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  onClick={() => handleDownloadPayslip(selectedPayroll)}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => setShowPayslipModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-black hover:bg-gray-50 transition-colors duration-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notice Modal */}
      {noticeOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  noticeType === 'success'
                    ? 'bg-green-100 text-green-600'
                    : noticeType === 'error'
                    ? 'bg-red-100 text-red-600'
                    : noticeType === 'warning'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  {noticeType === 'success' ? '✓' : noticeType === 'error' ? '✕' : noticeType === 'warning' ? '!' : 'i'}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{noticeTitle}</h3>
                  <p className="text-gray-600 whitespace-pre-line">{noticeMessage}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={closeNotice}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">⚠</div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{confirmTitle}</h3>
                  <p className="text-gray-600 whitespace-pre-line">{confirmMessage}</p>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={closeConfirm}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (confirmAction) {
                      await confirmAction();
                    }
                    closeConfirm();
                  }}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}