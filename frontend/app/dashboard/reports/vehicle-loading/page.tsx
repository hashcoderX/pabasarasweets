'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type LoadStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled';

type RefEmployee = {
  id: number;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  name?: string;
};

type RefVehicle = {
  id: number;
  registration_number?: string;
  type?: string;
  capacity_kg?: number;
};

type RefRoute = {
  id: number;
  name?: string;
  origin?: string;
  destination?: string;
  distance_km?: number;
};

type LoadRow = {
  id: number;
  load_number?: string;
  status?: LoadStatus;
  load_date?: string;
  delivery_date?: string | null;
  total_weight?: number;
  notes?: string | null;
  driver?: RefEmployee;
  sales_ref?: RefEmployee;
  salesRef?: RefEmployee;
  vehicle?: RefVehicle;
  route?: RefRoute;
  created_at?: string;
};

type LoadItemRow = {
  id: number;
  load_id: number;
  product_code?: string;
  name?: string;
  type?: 'finished_product' | 'raw_material';
  out_price?: number;
  sell_price?: number;
  qty?: number;
  loaded_qty?: number;
};

type CompanyBrand = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
};

type ReportRow = LoadRow & {
  item_count: number;
  total_qty: number;
  total_load_value: number;
};

type LoadDeliverySummary = {
  items?: Array<{
    item_code?: string;
    item_name?: string;
    sold_qty?: number;
    return_qty?: number;
    exchange_return_qty?: number;
    damaged_return_qty?: number;
    net_qty?: number;
    net_value?: number;
  }>;
};

const toArray = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (record.data && typeof record.data === 'object') {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items as T[];
    }
  }
  return [];
};

export default function VehicleLoadingReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LoadStatus>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [errorMessage, setErrorMessage] = useState('');
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [selectedLoadDetails, setSelectedLoadDetails] = useState<LoadRow | null>(null);
  const [selectedLoadItems, setSelectedLoadItems] = useState<LoadItemRow[]>([]);
  const [deliverySummary, setDeliverySummary] = useState<LoadDeliverySummary | null>(null);

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

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await Promise.all([fetchCompanyBrand(token), fetchRows(token)]);
      } catch (error) {
        console.error('Error checking vehicle loading report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const personName = (person?: RefEmployee) => {
    if (!person) return '-';
    return (
      person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.employee_code || '-'
    );
  };

  const fetchCompanyBrand = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const companyRes = await axios.get(`${API_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });

      const companyRows = Array.isArray(companyRes.data)
        ? companyRes.data
        : Array.isArray(companyRes.data?.data)
          ? companyRes.data.data
          : [];

      setCompanyBrand(companyRows.length > 0 ? companyRows[0] : null);
    } catch {
      setCompanyBrand(null);
    }
  };

  const fetchRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const loadsRes = await axios.get(`${API_URL}/api/vehicle-loading/loads`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });

      const loadsData = toArray<LoadRow>(loadsRes.data);
      const loadIds = loadsData.map((load) => Number(load.id)).filter((id) => Number.isFinite(id) && id > 0);

      const allItemsRes = await axios.get(`${API_URL}/api/vehicle-loading/load-items`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        params: { load_ids: loadIds.join(',') },
      });

      const allItems = toArray<LoadItemRow>(allItemsRes.data);
      const itemsByLoadId = new Map<number, LoadItemRow[]>();
      allItems.forEach((item) => {
        const loadId = Number(item.load_id || 0);
        if (!loadId) return;
        const bucket = itemsByLoadId.get(loadId) || [];
        bucket.push(item);
        itemsByLoadId.set(loadId, bucket);
      });

      const activeLoads = loadsData.filter((load) => {
        const status = String(load.status || '').toLowerCase();
        return status === 'pending' || status === 'in_transit';
      });

      const summaryEntries = await Promise.all(
        activeLoads.map(async (load) => {
          const summaryRes = await axios
            .get(`${API_URL}/api/vehicle-loading/loads/${load.id}/delivery-summary`, {
              headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
              timeout: 30000,
            })
            .catch(() => null);

          const summaryItems = toArray<{
            item_code?: string;
            sold_qty?: number;
            exchange_return_qty?: number;
          }>(summaryRes?.data?.data?.items);

          const summaryByCode = new Map<string, { soldQty: number; exchangeReturnQty: number }>();
          summaryItems.forEach((row) => {
            const code = String(row.item_code || '').trim().toLowerCase();
            if (!code) return;
            summaryByCode.set(code, {
              soldQty: Number(row.sold_qty || 0),
              exchangeReturnQty: Number(row.exchange_return_qty || 0),
            });
          });

          return [Number(load.id), summaryByCode] as const;
        })
      );

      const summaryByLoadId = new Map<number, Map<string, { soldQty: number; exchangeReturnQty: number }>>(summaryEntries);

      const withItems = await Promise.all(
        loadsData.map(async (load: LoadRow) => {
          try {
            const items = itemsByLoadId.get(Number(load.id)) || [];
            const summaryByCode = summaryByLoadId.get(Number(load.id));

            const normalizedLoadedItems = items
              .map((item) => {
                const code = String(item.product_code || '').trim().toLowerCase();
                const currentQty = Number(item.qty ?? 0);
                const loadedQtyFromSource = Number(item.loaded_qty ?? 0);
                const summary = summaryByCode?.get(code);
                const loadedQtyFromSummary = summary
                  ? Math.max(0, currentQty + Number(summary.soldQty || 0) - Number(summary.exchangeReturnQty || 0))
                  : null;
                const loadedQty = loadedQtyFromSummary !== null
                  ? loadedQtyFromSummary
                  : loadedQtyFromSource > 0
                    ? loadedQtyFromSource
                    : Math.max(0, currentQty);
                const costPrice = Number(item.out_price || 0);

                return {
                  loadedQty,
                  loadValue: loadedQty * (Number.isFinite(costPrice) ? costPrice : 0),
                };
              })
              .filter((entry) => entry.loadedQty > 0);

            const totalQty = normalizedLoadedItems.reduce((sum, entry) => sum + Number(entry.loadedQty || 0), 0);
            const totalLoadValue = normalizedLoadedItems.reduce((sum, entry) => sum + Number(entry.loadValue || 0), 0);

            return {
              ...load,
              sales_ref: load.sales_ref || load.salesRef,
              item_count: normalizedLoadedItems.length,
              total_qty: totalQty,
              total_load_value: totalLoadValue,
            } as ReportRow;
          } catch {
            return {
              ...load,
              sales_ref: load.sales_ref || load.salesRef,
              item_count: 0,
              total_qty: 0,
              total_load_value: 0,
            } as ReportRow;
          }
        })
      );

      setRows(withItems);
    } catch (error) {
      console.error('Error fetching vehicle loading report rows:', error);
      setRows([]);
      setErrorMessage('Failed to load vehicle loading report data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (startDate || endDate) {
        const d = row.load_date ? new Date(`${row.load_date}T00:00:00`) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
        if (endDate && d > new Date(`${endDate}T23:59:59`)) return false;
      }

      if (!term) return true;

      const text = [
        row.load_number,
        row.vehicle?.registration_number,
        row.route?.name,
        row.route?.origin,
        row.route?.destination,
        personName(row.driver),
        personName(row.sales_ref || row.salesRef),
        row.status,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, statusFilter, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const pending = filteredRows.filter((row) => row.status === 'pending').length;
    const inTransit = filteredRows.filter((row) => row.status === 'in_transit').length;
    const delivered = filteredRows.filter((row) => row.status === 'delivered').length;
    const cancelled = filteredRows.filter((row) => row.status === 'cancelled').length;

    const totalQty = filteredRows.reduce((sum, row) => sum + Number(row.total_qty || 0), 0);
    const totalValue = filteredRows.reduce((sum, row) => sum + Number(row.total_load_value || 0), 0);

    return { total, pending, inTransit, delivered, cancelled, totalQty, totalValue };
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pageStart = (currentPage - 1) * rowsPerPage;
  const pageEnd = pageStart + rowsPerPage;
  const pagedRows = filteredRows.slice(pageStart, pageEnd);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, startDate, endDate, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toDateLabel = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const toStatusLabel = (value?: string) => {
    return value ? value.replace('_', ' ').toUpperCase() : '-';
  };

  const formatMoney = (value?: number) => {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const rowToExport = (row: ReportRow) => {
    return [
      row.load_number || '-',
      toDateLabel(row.load_date),
      toDateLabel(row.delivery_date || null),
      row.vehicle?.registration_number || '-',
      row.route?.name || '-',
      `${row.route?.origin || '-'} -> ${row.route?.destination || '-'}`,
      personName(row.driver),
      personName(row.sales_ref || row.salesRef),
      toStatusLabel(row.status),
      String(row.item_count || 0),
      String(Number(row.total_qty || 0).toFixed(2)),
      formatMoney(row.total_load_value),
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Load Number',
      'Load Date',
      'Delivery Date',
      'Vehicle',
      'Route',
      'Origin -> Destination',
      'Driver',
      'Sales Ref',
      'Status',
      'Item Count',
      'Total Qty',
      'Load Value',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vehicle-loading-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const companyName = companyBrand?.name?.trim() || 'Company';
    const companyMeta = [companyBrand?.address, companyBrand?.phone, companyBrand?.email, companyBrand?.website]
      .filter(Boolean)
      .join(' | ');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(companyName, 40, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (companyMeta) {
      doc.text(companyMeta, 40, 44);
    }

    doc.setDrawColor(180);
    doc.line(40, 52, doc.internal.pageSize.getWidth() - 40, 52);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Vehicle Loading Report', 40, 72);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 90);
    doc.text(`Date Range: ${startDate || '-'} to ${endDate || '-'}`, 40, 104);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : toStatusLabel(statusFilter)}`, 40, 118);

    autoTable(doc, {
      startY: 132,
      head: [[
        'Load No',
        'Load Date',
        'Delivery Date',
        'Vehicle',
        'Route',
        'Driver',
        'Sales Ref',
        'Status',
        'Items',
        'Qty',
        'Load Value',
      ]],
      body: filteredRows.map((row) => {
        const values = rowToExport(row);
        return [
          values[0],
          values[1],
          values[2],
          values[3],
          values[4],
          values[6],
          values[7],
          values[8],
          values[9],
          values[10],
          values[11],
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Pending: ${summary.pending}, In Transit: ${summary.inTransit}, Delivered: ${summary.delivered}, Cancelled: ${summary.cancelled}, Qty: ${summary.totalQty.toFixed(2)}, Load Value: ${formatMoney(summary.totalValue)}`,
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
    doc.save(`vehicle-loading-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const detailsMetrics = useMemo(() => {
    const summaryItems = Array.isArray(deliverySummary?.items) ? deliverySummary.items : [];

    const summaryByCode = new Map<string, {
      soldQty: number;
      returnQty: number;
      exchangeReturnQty: number;
      damagedReturnQty: number;
      netQty: number;
      netValue: number;
      itemName: string;
    }>();

    summaryItems.forEach((row) => {
      const code = String(row.item_code || '').trim().toLowerCase();
      if (!code) return;
      summaryByCode.set(code, {
        soldQty: Number(row.sold_qty || 0),
        returnQty: Number(row.return_qty || 0),
        exchangeReturnQty: Number(row.exchange_return_qty || 0),
        damagedReturnQty: Number(row.damaged_return_qty || 0),
        netQty: Number(row.net_qty || 0),
        netValue: Number(row.net_value || 0),
        itemName: String(row.item_name || ''),
      });
    });

    const loadedRows = selectedLoadItems
      .map((item) => {
        const code = String(item.product_code || '').trim().toLowerCase();
        const summary = summaryByCode.get(code);
        const currentQty = Number(item.qty || 0);
        const soldQty = Number(summary?.soldQty || 0);
        const returnQty = Number(summary?.returnQty || 0);
        const exchangeReturnQty = Number(summary?.exchangeReturnQty || 0);
        const netDeliveredQty = Number(summary?.netQty || Math.max(0, soldQty - returnQty));
        const costPrice = Number(item.out_price || 0);

        // Rebuild original loaded qty. Current truck qty may already include exchange returns.
        const loadedQty = Math.max(0, currentQty + soldQty - exchangeReturnQty);
        const loadedValue = loadedQty * costPrice;

        return {
          id: item.id,
          product_code: item.product_code || '-',
          name: item.name || summary?.itemName || '-',
          type: item.type || '-',
          costPrice,
          loadedQty,
          currentQty,
          soldQty,
          returnQty,
          exchangeReturnQty,
          netDeliveredQty,
          loadedValue,
        };
      })
      .filter((row) => row.loadedQty > 0);

    const loadedQtyTotal = loadedRows.reduce((sum, row) => sum + row.loadedQty, 0);
    const deliveredQtyTotalFromSummary = summaryItems.reduce((sum, row) => sum + Number(row.net_qty || 0), 0);
    const deliveredQtyTotal = deliveredQtyTotalFromSummary > 0
      ? deliveredQtyTotalFromSummary
      : loadedRows.reduce((sum, row) => sum + row.netDeliveredQty, 0);

    const loadedValueTotal = loadedRows.reduce((sum, row) => sum + row.loadedValue, 0);
    const deliveredValueTotalFromSummary = summaryItems.reduce((sum, row) => sum + Number(row.net_value || 0), 0);
    const deliveredValueTotal = deliveredValueTotalFromSummary > 0
      ? deliveredValueTotalFromSummary
      : loadedRows.reduce((sum, row) => sum + row.netDeliveredQty * row.costPrice, 0);

    return {
      loadedRows,
      loadedQtyTotal,
      deliveredQtyTotal,
      balanceQtyTotal: Math.max(0, loadedQtyTotal - deliveredQtyTotal),
      loadedValueTotal,
      deliveredValueTotal,
      balanceValueTotal: Math.max(0, loadedValueTotal - deliveredValueTotal),
    };
  }, [selectedLoadItems, deliverySummary]);

  const handleViewDetails = async (loadId: number) => {
    const tokenToUse = token;
    if (!tokenToUse) return;

    try {
      setShowDetailsModal(true);
      setDetailsLoading(true);
      setDetailsError('');
      setSelectedLoadDetails(null);
      setSelectedLoadItems([]);
      setDeliverySummary(null);

      const [loadRes, itemsRes, summaryRes] = await Promise.all([
        axios.get(`${API_URL}/api/vehicle-loading/loads/${loadId}`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          timeout: 30000,
        }),
        axios.get(`${API_URL}/api/vehicle-loading/load-items`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { load_id: loadId },
          timeout: 30000,
        }),
        axios.get(`${API_URL}/api/vehicle-loading/loads/${loadId}/delivery-summary`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          timeout: 30000,
        }).catch(() => null),
      ]);

      setSelectedLoadDetails(loadRes.data as LoadRow);
      setSelectedLoadItems(Array.isArray(itemsRes.data) ? (itemsRes.data as LoadItemRow[]) : []);
      setDeliverySummary((summaryRes?.data?.data || null) as LoadDeliverySummary | null);
    } catch (error) {
      console.error('Error fetching load details:', error);
      setDetailsError('Failed to load vehicle load details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-indigo-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Vehicle Loading Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 w-full py-8 px-3 sm:px-4 lg:px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Vehicle Loading <span className="bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Track loads by route, vehicle, and status with PDF and CSV export.</p>
          {companyBrand?.name && (
            <p className="text-xs text-gray-600 mt-2">Branded for {companyBrand.name}</p>
          )}
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Load no, vehicle, route, driver"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | LoadStatus)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchRows()}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
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
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Pending: <strong>{summary.pending}</strong></span>
            <span>In Transit: <strong>{summary.inTransit}</strong></span>
            <span>Delivered: <strong>{summary.delivered}</strong></span>
            <span>Cancelled: <strong>{summary.cancelled}</strong></span>
            <span>Total Qty: <strong>{summary.totalQty.toFixed(2)}</strong></span>
            <span>Load Value: <strong>{formatMoney(summary.totalValue)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Load No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Load Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Delivery Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Load Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No vehicle loading records found.</td>
                  </tr>
                ) : (
                  pagedRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.load_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.load_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.delivery_date || null)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.vehicle?.registration_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.route?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{personName(row.driver)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                          row.status === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : row.status === 'in_transit'
                              ? 'bg-blue-100 text-blue-700'
                              : row.status === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {toStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.item_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.total_qty || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold text-right">{formatMoney(row.total_load_value)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(row.id)}
                          className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              Showing {filteredRows.length === 0 ? 0 : pageStart + 1} to {Math.min(pageEnd, filteredRows.length)} of {filteredRows.length} records
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-600">Rows:</label>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {showDetailsModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
            <div className="relative w-full max-w-7xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-5 py-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Vehicle Load Details</h3>
                  <p className="text-xs text-gray-600">Preview complete load information and item lines</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedLoadDetails(null);
                    setSelectedLoadItems([]);
                    setDeliverySummary(null);
                    setDetailsError('');
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[82vh] overflow-y-auto p-5">
                {detailsLoading ? (
                  <div className="py-12 text-center text-sm text-gray-600">Loading load details...</div>
                ) : detailsError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{detailsError}</div>
                ) : !selectedLoadDetails ? (
                  <div className="py-10 text-center text-sm text-gray-600">No details available.</div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Load Number</p>
                        <p className="text-sm font-semibold text-gray-900">{selectedLoadDetails.load_number || '-'}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                        <p className="text-sm font-semibold text-gray-900">{toStatusLabel(selectedLoadDetails.status)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Load Date</p>
                        <p className="text-sm font-semibold text-gray-900">{toDateLabel(selectedLoadDetails.load_date)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Delivery Date</p>
                        <p className="text-sm font-semibold text-gray-900">{toDateLabel(selectedLoadDetails.delivery_date || null)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Vehicle</p>
                        <p className="text-sm font-semibold text-gray-900">{selectedLoadDetails.vehicle?.registration_number || '-'}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Driver</p>
                        <p className="text-sm font-semibold text-gray-900">{personName(selectedLoadDetails.driver)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Sales Ref</p>
                        <p className="text-sm font-semibold text-gray-900">{personName(selectedLoadDetails.sales_ref || selectedLoadDetails.salesRef)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Route</p>
                        <p className="text-sm font-semibold text-gray-900">{selectedLoadDetails.route?.name || '-'}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Notes</p>
                      <p className="mt-1 text-sm text-gray-800">{selectedLoadDetails.notes || '-'}</p>
                    </div>

                    {deliverySummary && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
                          <p className="text-xs text-indigo-700">Loaded Qty</p>
                          <p className="text-sm font-semibold text-indigo-900">{Number(detailsMetrics.loadedQtyTotal || 0).toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                          <p className="text-xs text-sky-700">Loaded Value</p>
                          <p className="text-sm font-semibold text-sky-900">{formatMoney(Number(detailsMetrics.loadedValueTotal || 0))}</p>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-600">Product Code</th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-600">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-600">Type</th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-600">Loaded Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-600">Cost Price</th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-600">Load Valuation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {detailsMetrics.loadedRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">No loaded item rows found.</td>
                            </tr>
                          ) : (
                            detailsMetrics.loadedRows.map((item) => {
                              return (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 text-sm text-gray-700">{item.product_code || '-'}</td>
                                  <td className="px-3 py-2 text-sm text-gray-900 font-medium">{item.name || '-'}</td>
                                  <td className="px-3 py-2 text-sm text-gray-700">{item.type || '-'}</td>
                                  <td className="px-3 py-2 text-sm text-gray-700 text-right">{Number(item.loadedQty || 0).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-sm text-gray-700 text-right">{formatMoney(item.costPrice)}</td>
                                  <td className="px-3 py-2 text-sm text-gray-900 font-semibold text-right">{formatMoney(item.loadedValue)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
