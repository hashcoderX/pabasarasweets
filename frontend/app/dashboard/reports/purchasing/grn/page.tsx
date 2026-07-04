'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type Supplier = {
  id: number;
  name?: string;
};

type PurchaseOrder = {
  id: number;
  order_number?: string;
  supplier?: Supplier;
};

type GrnItem = {
  id: number;
  received_quantity?: number;
  accepted_quantity?: number;
  rejected_quantity?: number;
  quality_status?: 'pending' | 'accepted' | 'rejected' | 'partial';
};

type GrnRow = {
  id: number;
  grn_number?: string;
  received_date?: string;
  status?: 'draft' | 'received' | 'inspected' | 'approved' | 'rejected';
  notes?: string;
  purchase_order_id?: number;
  purchase_order?: PurchaseOrder;
  purchaseOrder?: PurchaseOrder;
  grn_items?: GrnItem[];
  grnItems?: GrnItem[];
};

export default function GrnReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GrnRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'received' | 'inspected' | 'approved' | 'rejected'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';

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
          ...(Array.isArray(userData?.roles) ? userData.roles.map((role: any) => String(role?.name || role || '')) : []),
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
        const isAdminUser = !employeeId || roleBlob.includes('super admin') || roleBlob.includes('superadmin') || roleBlob.includes('administrator') || roleBlob.includes('admin');
        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await fetchRows(token);
      } catch (error) {
        console.error('Error checking GRN report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');
      const response = await axios.get(`${API_URL}/api/purchasing/grn`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      const dataRows = Array.isArray(response.data) ? response.data : [];
      setRows(dataRows);
    } catch (error) {
      console.error('Error loading GRN report:', error);
      setRows([]);
      setErrorMessage('Failed to load GRN report data.');
    } finally {
      setLoading(false);
    }
  };

  const normalizedRows = useMemo(() => {
    return rows.map((row) => ({
      ...row,
      purchaseOrder: row.purchaseOrder || row.purchase_order,
      grnItems: row.grnItems || row.grn_items || [],
    }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return normalizedRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (startDate || endDate) {
        const d = row.received_date ? new Date(`${row.received_date}T00:00:00`) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
        if (endDate && d > new Date(`${endDate}T23:59:59`)) return false;
      }

      if (!term) return true;

      const grnNo = String(row.grn_number || '').toLowerCase();
      const poNo = String(row.purchaseOrder?.order_number || '').toLowerCase();
      const supplier = String(row.purchaseOrder?.supplier?.name || '').toLowerCase();
      const notes = String(row.notes || '').toLowerCase();

      return grnNo.includes(term) || poNo.includes(term) || supplier.includes(term) || notes.includes(term);
    });
  }, [normalizedRows, search, statusFilter, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const received = filteredRows.filter((r) => r.status === 'received').length;
    const approved = filteredRows.filter((r) => r.status === 'approved').length;
    const rejected = filteredRows.filter((r) => r.status === 'rejected').length;

    let totalReceivedQty = 0;
    let totalAcceptedQty = 0;
    let totalRejectedQty = 0;

    filteredRows.forEach((row) => {
      const items = Array.isArray(row.grnItems) ? row.grnItems : [];
      items.forEach((item) => {
        totalReceivedQty += Number(item.received_quantity || 0);
        totalAcceptedQty += Number(item.accepted_quantity || 0);
        totalRejectedQty += Number(item.rejected_quantity || 0);
      });
    });

    return { total, received, approved, rejected, totalReceivedQty, totalAcceptedQty, totalRejectedQty };
  }, [filteredRows]);

  const toDateLabel = (value?: string) => {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
  };

  const rowToExport = (row: any) => {
    const items = Array.isArray(row.grnItems) ? row.grnItems : [];
    const receivedQty = items.reduce((sum: number, item: GrnItem) => sum + Number(item.received_quantity || 0), 0);
    const acceptedQty = items.reduce((sum: number, item: GrnItem) => sum + Number(item.accepted_quantity || 0), 0);
    const rejectedQty = items.reduce((sum: number, item: GrnItem) => sum + Number(item.rejected_quantity || 0), 0);

    return [
      row.grn_number || '-',
      toDateLabel(row.received_date),
      row.purchaseOrder?.order_number || '-',
      row.purchaseOrder?.supplier?.name || '-',
      row.status ? row.status.toUpperCase() : '-',
      String(items.length),
      String(receivedQty),
      String(acceptedQty),
      String(rejectedQty),
    ];
  };

  const exportCsv = () => {
    const headers = ['GRN Number', 'Received Date', 'PO Number', 'Supplier', 'Status', 'Item Count', 'Received Qty', 'Accepted Qty', 'Rejected Qty'];
    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `grn-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('GRN Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Date Range: ${startDate || '-'} to ${endDate || '-'}`, 40, 72);

    autoTable(doc, {
      startY: 88,
      head: [['GRN Number', 'Received Date', 'PO Number', 'Supplier', 'Status', 'Item Count', 'Received Qty', 'Accepted Qty', 'Rejected Qty']],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Received: ${summary.received}, Approved: ${summary.approved}, Rejected: ${summary.rejected}, Qty Rec/Acc/Rej: ${summary.totalReceivedQty}/${summary.totalAcceptedQty}/${summary.totalRejectedQty}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    return doc;
  };

  const viewPdf = () => window.open(buildPdf().output('bloburl'), '_blank');
  const downloadPdf = () => buildPdf().save(`grn-report-${new Date().toISOString().split('T')[0]}.pdf`);

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-lime-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-lime-50 to-teal-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-lime-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-emerald-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>GRN Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">GRN <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Report</span></h1>
          <p className="text-gray-600">Goods received notes overview with quantity and quality status analytics.</p>
        </div>

        {errorMessage && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-xl p-4 md:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="GRN number, PO number, supplier" className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2">
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="received">Received</option>
                <option value="inspected">Inspected</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button type="button" onClick={() => fetchRows()} disabled={loading} className="w-full px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60">{loading ? 'Loading...' : 'Refresh Data'}</button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">View PDF</button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Download PDF</button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">Download CSV (Excel)</button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Received: <strong>{summary.received}</strong></span>
            <span>Approved: <strong>{summary.approved}</strong></span>
            <span>Rejected: <strong>{summary.rejected}</strong></span>
            <span>Qty Rec/Acc/Rej: <strong>{summary.totalReceivedQty}/{summary.totalAcceptedQty}/{summary.totalRejectedQty}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">GRN Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Received Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">PO Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Rec Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Acc Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Rej Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">No GRN records found.</td></tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const items = Array.isArray(row.grnItems) ? row.grnItems : [];
                    const recQty = items.reduce((sum, i) => sum + Number(i.received_quantity || 0), 0);
                    const accQty = items.reduce((sum, i) => sum + Number(i.accepted_quantity || 0), 0);
                    const rejQty = items.reduce((sum, i) => sum + Number(i.rejected_quantity || 0), 0);

                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.grn_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.received_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.purchaseOrder?.order_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.purchaseOrder?.supplier?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{items.length}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{recQty}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{accQty}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{rejQty}</td>
                        <td className="px-4 py-3 text-sm"><span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{row.status ? row.status.toUpperCase() : '-'}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
