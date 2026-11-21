'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type PaymentMethod = 'cash' | 'check' | 'bank_transfer';
type PaymentStatus = 'received' | 'cleared' | 'bounced' | 'pending' | 'returned' | 'closed';

type CustomerInfo = {
  id: number;
  shop_name?: string;
  customer_code?: string;
  outstanding?: number;
  opening_balance?: number;
};

type InvoiceInfo = {
  id: number;
  invoice_number?: string;
};

type PaymentRow = {
  id: number;
  payment_number?: string;
  customer?: CustomerInfo | null;
  invoice?: InvoiceInfo | null;
  payment_date?: string;
  amount?: number;
  payment_method?: PaymentMethod;
  status?: PaymentStatus;
  reference_no?: string;
  bank_name?: string;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

type PaymentHistoryCachePayload = {
  savedAt: number;
  rows: PaymentRow[];
};

type DistributionCustomerRow = {
  id: number;
  shop_name?: string;
  customer_code?: string;
  outstanding?: number;
  opening_balance?: number;
  status?: string;
};

type DistributionInvoiceRow = {
  id: number;
  invoice_number?: string;
  invoice_date?: string;
  total?: number;
  paid_amount?: number;
  status?: string;
  created_at?: string;
};

type LedgerEntry = {
  date: string;
  type: 'opening' | 'invoice' | 'payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
};

type LedgerChartPoint = {
  label: string;
  balance: number;
  debit: number;
  credit: number;
};

const PAYMENT_HISTORY_CACHE_VERSION = 'v1';
const PAYMENT_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const CUSTOMER_PAGE_SIZE = 15;

export default function DistributionPaymentHistoryReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [customers, setCustomers] = useState<DistributionCustomerRow[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotalPages, setCustomerTotalPages] = useState(1);
  const [customerTotalRows, setCustomerTotalRows] = useState(0);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<DistributionCustomerRow | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerRowsPerPage, setLedgerRowsPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loadProgress, setLoadProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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

    const verifyAccess = async () => {
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
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role: any) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission: any) => String(permission?.name || '').trim().toLowerCase())
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));
        const isSalesRef =
          roleBlob.includes('sales ref') ||
          roleBlob.includes('sales representative') ||
          roleBlob.includes('sales_ref');

        if (!isAdminUser && !hasReportPermission && !isSalesRef) {
          router.push('/dashboard');
          return;
        }

        setAccessReady(true);
        void fetchCustomersPage(token, 1, customerSearch);
        void fetchRows(token, { allowCachedHydration: true });
      } catch (error) {
        console.error('Error checking payment history access:', error);
        router.push('/dashboard');
      }
    };

    verifyAccess();
  }, [token, router]);

  const getRowIdentity = (row: PaymentRow) => {
    return [
      row.id,
      row.payment_number || '',
      row.invoice?.id || '',
      row.invoice?.invoice_number || '',
      row.customer?.id || '',
      row.payment_date || '',
      Number(row.amount || 0),
      row.reference_no || '',
      row.bank_name || '',
    ].join('|');
  };

  const getCacheKey = (authToken: string, customerId?: number | null) => {
    const tokenSuffix = authToken.slice(-12) || 'anon';
    const customerSuffix = customerId ? `-customer-${customerId}` : '-all';
    return `distribution-payment-history-${PAYMENT_HISTORY_CACHE_VERSION}-${tokenSuffix}${customerSuffix}`;
  };

  const readCachedRows = (authToken: string, customerId?: number | null) => {
    try {
      const raw = localStorage.getItem(getCacheKey(authToken, customerId));
      if (!raw) return null;
      const parsed: PaymentHistoryCachePayload = JSON.parse(raw);
      if (!parsed?.savedAt || !Array.isArray(parsed.rows)) return null;
      if (Date.now() - parsed.savedAt > PAYMENT_HISTORY_CACHE_TTL_MS) return null;
      return parsed.rows;
    } catch {
      return null;
    }
  };

  const writeCachedRows = (authToken: string, nextRows: PaymentRow[], customerId?: number | null) => {
    try {
      const payload: PaymentHistoryCachePayload = {
        savedAt: Date.now(),
        rows: nextRows,
      };
      localStorage.setItem(getCacheKey(authToken, customerId), JSON.stringify(payload));
    } catch {
      // Ignore storage failures to keep the report usable.
    }
  };

  const fetchRows = async (authToken?: string, options?: { allowCachedHydration?: boolean; customerId?: number | null }) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const allowCachedHydration = !!options?.allowCachedHydration;
      const customerId = options?.customerId || null;
      const cachedRows = allowCachedHydration ? readCachedRows(tokenToUse, customerId) : null;

      if (cachedRows && cachedRows.length > 0) {
        setRows(cachedRows);
      }

      setLoading(true);
      setLoadProgress('Loading latest payments...');
      setErrorMessage('');

      const rowMap = new Map<string, PaymentRow>();
      const allRows: PaymentRow[] = [];
      let nextUrl: string | null = customerId
        ? `${API_URL}/api/distribution/payments?per_page=500&customer_id=${customerId}`
        : `${API_URL}/api/distribution/payments?per_page=500`;
      let pageCount = 0;
      const maxPages = 50;

      while (nextUrl && pageCount < maxPages) {
        const response: { data: { data?: PaginatedResponse<PaymentRow> } } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        });

        const payload = response.data?.data;
        const pageRows = Array.isArray(payload?.data) ? payload.data : [];
        pageRows.forEach((row) => {
          const key = getRowIdentity(row);
          rowMap.set(key, row);
        });

        const mergedRows = Array.from(rowMap.values());
        allRows.length = 0;
        allRows.push(...mergedRows);
        setRows(mergedRows);

        nextUrl = payload?.next_page_url || null;
        pageCount += 1;

        if (nextUrl) {
          setLoadProgress(`Loading latest payments... page ${pageCount + 1}`);
        }
      }

      setRows(allRows);
      writeCachedRows(tokenToUse, allRows, customerId);
      setLoadProgress('');
    } catch (error) {
      console.error('Error fetching payment history rows:', error);
      if (rows.length === 0) {
        setRows([]);
      }
      setErrorMessage('Failed to load payment history data.');
      setLoadProgress('');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomersPage = async (authToken: string, page: number, searchText: string) => {
    try {
      setCustomerLoading(true);

      const response: {
        data?: {
          data?: {
            data?: DistributionCustomerRow[];
            current_page?: number;
            last_page?: number;
            total?: number;
          };
        };
      } = await axios.get('/api/distribution/customers', {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
        params: {
          page,
          per_page: CUSTOMER_PAGE_SIZE,
          ...(searchText.trim() ? { search: searchText.trim() } : {}),
        },
      });

      const payload = response.data?.data;
      const pageRows = Array.isArray(payload?.data) ? payload.data : [];
      setCustomers(pageRows);
      setCustomerPage(Number(payload?.current_page || page));
      setCustomerTotalPages(Math.max(1, Number(payload?.last_page || 1)));
      setCustomerTotalRows(Number(payload?.total || pageRows.length));
    } catch (error) {
      console.error('Error fetching distribution customers:', error);
      setCustomers([]);
      setCustomerTotalPages(1);
      setCustomerTotalRows(0);
    } finally {
      setCustomerLoading(false);
    }
  };

  const fetchAllPages = async <T,>(
    authToken: string,
    endpoint: string,
    params: Record<string, string | number | boolean>
  ): Promise<T[]> => {
    const collected: T[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= 50) {
      const response: {
        data?: {
          data?: {
            data?: T[];
            next_page_url?: string | null;
          };
        };
      } = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
        params: {
          ...params,
          page,
          per_page: 500,
        },
      });

      const payload = response.data?.data;
      const pageRows = Array.isArray(payload?.data) ? payload.data : [];
      collected.push(...pageRows);
      hasNext = !!payload?.next_page_url;
      page += 1;
    }

    return collected;
  };

  const buildCustomerLedger = (customer: DistributionCustomerRow, invoices: DistributionInvoiceRow[], payments: PaymentRow[]) => {
    const openingBalance = Number(customer.opening_balance || 0);
    const timeline = [
      ...invoices.map((invoice) => ({
        date: invoice.invoice_date || invoice.created_at || '',
        type: 'invoice' as const,
        reference: invoice.invoice_number || `INV-${invoice.id}`,
        description: 'Invoice issued',
        debit: Number(invoice.total || 0),
        credit: 0,
        status: invoice.status || '',
      })),
      ...payments.map((payment) => ({
        date: payment.payment_date || '',
        type: 'payment' as const,
        reference: payment.payment_number || `PAY-${payment.id}`,
        description: `${methodLabel(payment.payment_method)} payment`,
        debit: 0,
        credit: Number(payment.amount || 0),
        status: payment.status || '',
      })),
    ].sort((a, b) => {
      const tA = new Date(a.date || '1970-01-01').getTime();
      const tB = new Date(b.date || '1970-01-01').getTime();
      if (tA !== tB) return tA - tB;
      if (a.type === b.type) return 0;
      return a.type === 'invoice' ? -1 : 1;
    });

    const ledger: LedgerEntry[] = [];
    let runningBalance = openingBalance;

    ledger.push({
      date: '-',
      type: 'opening',
      reference: 'OPENING',
      description: 'Account opening balance',
      debit: 0,
      credit: 0,
      balance: runningBalance,
      status: '',
    });

    timeline.forEach((entry) => {
      runningBalance += entry.debit - entry.credit;
      ledger.push({
        date: toDateLabel(entry.date),
        type: entry.type,
        reference: entry.reference,
        description: entry.description,
        debit: entry.debit,
        credit: entry.credit,
        balance: runningBalance,
        status: entry.status,
      });
    });

    return ledger;
  };

  const handleCustomerSelect = async (customer: DistributionCustomerRow) => {
    if (!token) return;

    setSelectedCustomer(customer);
    setLedgerPage(1);
    setLedgerLoading(true);
    setErrorMessage('');

    try {
      await fetchRows(token, { customerId: customer.id, allowCachedHydration: true });

      const [invoiceRows, paymentRows] = await Promise.all([
        fetchAllPages<DistributionInvoiceRow>(token, '/api/distribution/invoices', {
          customer_id: customer.id,
          exclude_cancelled: true,
        }),
        fetchAllPages<PaymentRow>(token, '/api/distribution/payments', {
          customer_id: customer.id,
        }),
      ]);

      setLedgerRows(buildCustomerLedger(customer, invoiceRows, paymentRows));
    } catch (error) {
      console.error('Error loading customer ledger:', error);
      setLedgerRows([]);
      setErrorMessage('Failed to load customer ledger details.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const clearSelectedCustomer = async () => {
    setSelectedCustomer(null);
    setLedgerRows([]);
    setLedgerPage(1);
    await fetchRows(token, { allowCachedHydration: true });
  };

  useEffect(() => {
    if (!token || !accessReady) return;
    void fetchCustomersPage(token, 1, customerSearch);
  }, [customerSearch, token, accessReady]);

  useEffect(() => {
    if (!selectedCustomer) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedCustomer]);

  const parseAmount = (value?: number) => Number(value || 0);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (methodFilter !== 'all' && row.payment_method !== methodFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (fromDate) {
        const d = row.payment_date ? new Date(row.payment_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate) {
        const d = row.payment_date ? new Date(row.payment_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date(toDate + 'T23:59:59')) return false;
      }

      if (!term) return true;

      const text = [
        row.payment_number,
        row.customer?.shop_name,
        row.customer?.customer_code,
        row.invoice?.invoice_number,
        row.payment_method,
        row.status,
        row.reference_no,
        row.bank_name,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, methodFilter, statusFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, filteredRows.length);

  const pagedRows = useMemo(() => {
    return filteredRows.slice(startIndex, endIndex);
  }, [filteredRows, startIndex, endIndex]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, methodFilter, statusFilter, fromDate, toDate, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerRows.length / ledgerRowsPerPage));
  const safeLedgerPage = Math.min(ledgerPage, ledgerTotalPages);
  const ledgerStartIndex = (safeLedgerPage - 1) * ledgerRowsPerPage;
  const ledgerEndIndex = Math.min(ledgerStartIndex + ledgerRowsPerPage, ledgerRows.length);

  const pagedLedgerRows = useMemo(() => {
    return ledgerRows.slice(ledgerStartIndex, ledgerEndIndex);
  }, [ledgerRows, ledgerStartIndex, ledgerEndIndex]);

  useEffect(() => {
    setLedgerPage(1);
  }, [selectedCustomer, ledgerRowsPerPage]);

  useEffect(() => {
    if (ledgerPage > ledgerTotalPages) {
      setLedgerPage(ledgerTotalPages);
    }
  }, [ledgerPage, ledgerTotalPages]);

  const summary = useMemo(() => {
    const totalPayments = filteredRows.length;
    const totalAmount = filteredRows.reduce((sum, row) => sum + parseAmount(row.amount), 0);

    const methodTotals = {
      cash: filteredRows.filter((row) => row.payment_method === 'cash').reduce((sum, row) => sum + parseAmount(row.amount), 0),
      check: filteredRows.filter((row) => row.payment_method === 'check').reduce((sum, row) => sum + parseAmount(row.amount), 0),
      bank_transfer: filteredRows.filter((row) => row.payment_method === 'bank_transfer').reduce((sum, row) => sum + parseAmount(row.amount), 0),
    };

    return { totalPayments, totalAmount, methodTotals };
  }, [filteredRows]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();

    filteredRows.forEach((row) => {
      if (!row.payment_date) return;
      const date = new Date(row.payment_date);
      if (Number.isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const prev = map.get(key) || { count: 0, amount: 0 };
      prev.count += 1;
      prev.amount += parseAmount(row.amount);
      map.set(key, prev);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, ...value }));
  }, [filteredRows]);

  const ledgerOutstandingAmount = useMemo(() => {
    if (ledgerRows.length === 0) return Number(selectedCustomer?.outstanding || 0);
    return Number(ledgerRows[ledgerRows.length - 1]?.balance || 0);
  }, [ledgerRows, selectedCustomer]);

  const ledgerChartData = useMemo<LedgerChartPoint[]>(() => {
    return ledgerRows.map((row, idx) => ({
      label: row.type === 'opening' ? 'Opening' : `${idx}`,
      balance: Number(row.balance || 0),
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
    }));
  }, [ledgerRows]);

  const ledgerChartModel = useMemo(() => {
    if (ledgerChartData.length === 0) return null;

    const width = 920;
    const height = 260;
    const padLeft = 52;
    const padRight = 16;
    const padTop = 14;
    const padBottom = 30;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    const balanceValues = ledgerChartData.map((p) => p.balance);
    const minBalance = Math.min(...balanceValues);
    const maxBalance = Math.max(...balanceValues);
    const spread = maxBalance - minBalance;
    const paddedMin = minBalance - Math.max(100, spread * 0.12);
    const paddedMax = maxBalance + Math.max(100, spread * 0.12);
    const safeRange = Math.max(1, paddedMax - paddedMin);

    const valueToY = (value: number) => {
      const ratio = (value - paddedMin) / safeRange;
      return padTop + (1 - ratio) * plotHeight;
    };

    const indexToX = (index: number) => {
      if (ledgerChartData.length === 1) return padLeft + plotWidth / 2;
      const ratio = index / (ledgerChartData.length - 1);
      return padLeft + ratio * plotWidth;
    };

    const points = ledgerChartData.map((point, index) => ({
      x: indexToX(index),
      y: valueToY(point.balance),
      balance: point.balance,
      debit: point.debit,
      credit: point.credit,
      label: point.label,
    }));

    const balancePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const yTicks = [0, 1, 2, 3, 4].map((step) => {
      const value = paddedMin + (safeRange * step) / 4;
      return { value, y: valueToY(value) };
    });

    return {
      width,
      height,
      padLeft,
      padRight,
      padBottom,
      points,
      balancePath,
      yTicks,
    };
  }, [ledgerChartData]);

  const toDateLabel = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const formatMoney = (value?: number) => {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const methodLabel = (value?: PaymentMethod) => {
    if (value === 'bank_transfer') return 'Bank Transfer';
    if (value === 'check') return 'Check';
    return 'Cash';
  };

  const methodBadgeClass = (method?: PaymentMethod) => {
    if (method === 'bank_transfer') return 'bg-blue-100 text-blue-700';
    if (method === 'check') return 'bg-purple-100 text-purple-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const rowToExport = (row: PaymentRow) => {
    return [
      row.payment_number || '-',
      row.invoice?.invoice_number || '-',
      row.customer?.customer_code || '-',
      row.customer?.shop_name || '-',
      toDateLabel(row.payment_date),
      methodLabel(row.payment_method),
      row.status ? row.status.toUpperCase() : '-',
      formatMoney(row.amount),
      row.reference_no || '-',
      row.bank_name || '-',
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Payment Number',
      'Invoice Number',
      'Customer Code',
      'Customer Name',
      'Payment Date',
      'Method',
      'Status',
      'Amount',
      'Reference',
      'Bank',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-payment-history-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Distribution Payment History Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Method Filter: ${methodFilter === 'all' ? 'ALL' : methodLabel(methodFilter)}`, 40, 72);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Payment #',
        'Invoice #',
        'Customer',
        'Date',
        'Method',
        'Status',
        'Amount',
        'Reference',
        'Bank',
      ]],
      body: filteredRows.map((row) => {
        const values = rowToExport(row);
        return [
          values[0],
          values[1],
          `${values[2]} - ${values[3]}`,
          values[4],
          values[5],
          values[6],
          values[7],
          values[8],
          values[9],
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Payments: ${summary.totalPayments} | Total: ${formatMoney(summary.totalAmount)} | Cash: ${formatMoney(summary.methodTotals.cash)} | Check: ${formatMoney(summary.methodTotals.check)} | Bank Transfer: ${formatMoney(summary.methodTotals.bank_transfer)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    return doc;
  };

  const viewPdf = () => {
    const doc = buildPdf();
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  };

  const downloadPdf = () => {
    const doc = buildPdf();
    doc.save(`distribution-payment-history-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const buildCustomerLedgerPdf = () => {
    if (!selectedCustomer) return null;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Customer Ledger Payment History', 40, 40);

    doc.setFontSize(10);
    doc.text(`Customer: ${selectedCustomer.customer_code || '-'} - ${selectedCustomer.shop_name || '-'}`, 40, 58);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 74);
    doc.text(`Outstanding: ${formatMoney(ledgerOutstandingAmount)}`, 40, 90);

    autoTable(doc, {
      startY: 104,
      head: [[
        'Date',
        'Type',
        'Reference',
        'Description',
        'Status',
        'Debit',
        'Credit',
        'Balance',
      ]],
      body: ledgerRows.map((row) => [
        row.date,
        row.type.toUpperCase(),
        row.reference,
        row.description,
        (row.status || '-').toUpperCase(),
        formatMoney(row.debit),
        formatMoney(row.credit),
        formatMoney(row.balance),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [13, 148, 136] },
      margin: { left: 20, right: 20 },
    });

    return doc;
  };

  const viewCustomerLedgerPdf = () => {
    const doc = buildCustomerLedgerPdf();
    if (!doc) return;
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  };

  const downloadCustomerLedgerPdf = () => {
    const doc = buildCustomerLedgerPdf();
    if (!doc) return;
    const safeCode = (selectedCustomer?.customer_code || 'customer').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`customer-ledger-${safeCode}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-green-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-green-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Payment History Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 w-full py-8 px-3 sm:px-4 lg:px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Payment History <span className="bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Payment timeline and method analytics for distribution collections.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer Search</label>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Shop name or customer code"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Payment no, invoice no, customer, reference"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | PaymentStatus)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="received">Received</option>
                <option value="cleared">Cleared</option>
                <option value="pending">Pending</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div className="md:col-span-6 flex justify-end">
              <button
                type="button"
                onClick={() => fetchRows(token, { customerId: selectedCustomer?.id || null })}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-green-700 hover:to-teal-700 disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh Data'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              View PDF
            </button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              Download PDF
            </button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">
              Download CSV (Excel)
            </button>
          </div>

          {loading && loadProgress && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {loadProgress}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-yellow-50 flex flex-wrap items-center justify-between gap-3 text-sm text-black">
            <div className="font-semibold">Customer Master</div>
            <div className="text-xs text-gray-700">Total Customers: {customerTotalRows}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Shop Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {customerLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Loading customers...</td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No customers found.</td>
                  </tr>
                ) : (
                  customers.map((customer, idx) => (
                    <tr
                      key={`${customer.id}-${customer.customer_code || 'nocode'}-${idx}`}
                      className={selectedCustomer?.id === customer.id ? 'bg-emerald-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                    >
                      <td className="px-4 py-3 text-sm text-gray-800 font-medium">{customer.customer_code || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{customer.shop_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(Number(customer.outstanding || 0))}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          type="button"
                          onClick={() => handleCustomerSelect(customer)}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-sm text-gray-700">Page {customerPage} of {customerTotalPages}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchCustomersPage(token, Math.max(1, customerPage - 1), customerSearch)}
                disabled={customerPage <= 1 || customerLoading}
                className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => void fetchCustomersPage(token, Math.min(customerTotalPages, customerPage + 1), customerSearch)}
                disabled={customerPage >= customerTotalPages || customerLoading}
                className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => void clearSelectedCustomer()}></div>

            <section className="relative z-10 w-full sm:max-w-6xl h-[94vh] sm:h-auto sm:max-h-[90vh] overflow-hidden sm:rounded-2xl border border-white/70 bg-white shadow-2xl flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex flex-wrap items-center justify-between gap-3 text-sm text-black sticky top-0 z-20">
                <div>
                  <div className="font-semibold">Customer Account Ledger</div>
                  <div className="text-xs text-gray-700">{selectedCustomer.customer_code || '-'} - {selectedCustomer.shop_name || '-'}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={viewCustomerLedgerPdf}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    View Ledger PDF
                  </button>
                  <button
                    type="button"
                    onClick={downloadCustomerLedgerPdf}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  >
                    Download Ledger PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearSelectedCustomer()}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-gray-100 bg-gray-50/60">
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-gray-500">Opening Balance</div>
                  <div className="text-lg font-bold text-gray-900">{formatMoney(Number(selectedCustomer.opening_balance || 0))}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-gray-500">Outstanding (Ledger)</div>
                  <div className="text-lg font-bold text-red-600">{formatMoney(ledgerOutstandingAmount)}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-gray-500">Outstanding (Master)</div>
                  <div className="text-lg font-bold text-amber-700">{formatMoney(Number(selectedCustomer.outstanding || 0))}</div>
                </div>
              </div>

              <div className="px-4 py-4 border-b border-gray-100 bg-white">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Ledger Trend Preview</div>
                <div className="rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50 p-3 overflow-x-auto">
                  {ledgerChartModel && ledgerRows.length > 0 ? (
                    <svg
                      viewBox={`0 0 ${ledgerChartModel.width} ${ledgerChartModel.height}`}
                      className="w-full min-w-[760px] h-[260px]"
                      role="img"
                      aria-label="Ledger balance trend"
                    >
                      {ledgerChartModel.yTicks.map((tick, idx) => (
                        <g key={`ledger-tick-${idx}`}>
                          <line
                            x1={ledgerChartModel.padLeft}
                            y1={tick.y}
                            x2={ledgerChartModel.width - ledgerChartModel.padRight}
                            y2={tick.y}
                            stroke="#dbeafe"
                            strokeWidth="1"
                          />
                          <text
                            x={ledgerChartModel.padLeft - 8}
                            y={tick.y + 4}
                            textAnchor="end"
                            className="fill-slate-500"
                            style={{ fontSize: '11px' }}
                          >
                            {formatMoney(tick.value)}
                          </text>
                        </g>
                      ))}

                      <path d={ledgerChartModel.balancePath} fill="none" stroke="#0f766e" strokeWidth="2.5" />

                      {ledgerChartModel.points.map((point, idx) => (
                        <g key={`ledger-point-${idx}`}>
                          <circle cx={point.x} cy={point.y} r="3.5" fill="#0f766e" />
                          {point.debit > 0 && <circle cx={point.x} cy={point.y - 9} r="2" fill="#dc2626" />}
                          {point.credit > 0 && <circle cx={point.x} cy={point.y + 9} r="2" fill="#16a34a" />}
                        </g>
                      ))}

                      <line
                        x1={ledgerChartModel.padLeft}
                        y1={ledgerChartModel.height - ledgerChartModel.padBottom}
                        x2={ledgerChartModel.width - ledgerChartModel.padRight}
                        y2={ledgerChartModel.height - ledgerChartModel.padBottom}
                        stroke="#94a3b8"
                        strokeWidth="1"
                      />
                    </svg>
                  ) : (
                    <div className="text-sm text-gray-500 py-8 text-center">No ledger chart data available.</div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-700"></span> Balance</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600"></span> Debit marker</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-600"></span> Credit marker</span>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Credit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {ledgerLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">Loading customer ledger...</td>
                      </tr>
                    ) : ledgerRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">No ledger data found for this customer.</td>
                      </tr>
                    ) : (
                      pagedLedgerRows.map((entry, idx) => (
                        <tr key={`${entry.type}-${entry.reference}-${entry.date}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                          <td className="px-4 py-3 text-sm text-gray-700">{entry.date}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium uppercase">{entry.type}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{entry.reference}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{entry.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{entry.status ? entry.status.toUpperCase() : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">{entry.debit > 0 ? formatMoney(entry.debit) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-emerald-600 font-semibold">{entry.credit > 0 ? formatMoney(entry.credit) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 font-bold">{formatMoney(entry.balance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
                </div>

                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky bottom-0 z-20">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Rows per page:</span>
                  <select
                    value={ledgerRowsPerPage}
                    onChange={(e) => setLedgerRowsPerPage(Number(e.target.value))}
                    className="rounded-md border border-gray-300 text-sm text-black px-2 py-1"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-gray-600">
                    {ledgerRows.length === 0 ? '0-0' : `${ledgerStartIndex + 1}-${ledgerEndIndex}`} of {ledgerRows.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLedgerPage((prev) => Math.max(1, prev - 1))}
                    disabled={safeLedgerPage <= 1}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="text-sm text-gray-700 min-w-[120px] text-center">
                    Page {safeLedgerPage} of {ledgerTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLedgerPage((prev) => Math.min(ledgerTotalPages, prev + 1))}
                    disabled={safeLedgerPage >= ledgerTotalPages}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total Payments: <strong>{summary.totalPayments}</strong></span>
            <span>Total Amount: <strong>{formatMoney(summary.totalAmount)}</strong></span>
            <span>Cash: <strong>{formatMoney(summary.methodTotals.cash)}</strong></span>
            <span>Check: <strong>{formatMoney(summary.methodTotals.check)}</strong></span>
            <span>Bank Transfer: <strong>{formatMoney(summary.methodTotals.bank_transfer)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Payment #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">No payment history records found.</td>
                  </tr>
                ) : (
                  pagedRows.map((row, idx) => (
                    <tr key={`${row.id}-${row.payment_number || 'no-pay'}-${row.invoice?.invoice_number || 'no-inv'}-${row.payment_date || 'no-date'}-${row.amount || 0}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.payment_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.invoice?.invoice_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {(row.customer?.customer_code || '-') + ' - ' + (row.customer?.shop_name || '-')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.payment_date)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${methodBadgeClass(row.payment_method)}`}>
                          {methodLabel(row.payment_method)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.status ? row.status.toUpperCase() : '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.reference_no || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border border-gray-300 text-sm text-black px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-gray-600">
                {filteredRows.length === 0 ? '0-0' : `${startIndex + 1}-${endIndex}`} of {filteredRows.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-gray-700 min-w-[120px] text-center">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50 text-sm font-semibold text-black">
            Monthly Payment Trend
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Payment Count</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {monthlyTrend.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">No monthly trend data available.</td>
                  </tr>
                ) : (
                  monthlyTrend.map((row, idx) => (
                    <tr key={row.month} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.month}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{row.count}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.amount)}</td>
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
