'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type DriverStatus = 'active' | 'inactive' | 'suspended';
type LicenseType = 'light' | 'heavy' | 'special';

type Driver = {
  id: number;
  name: string;
  employee_id: string;
  license_number: string;
  license_type: LicenseType;
  license_expiry: string;
  phone: string;
  email: string;
  status: DriverStatus;
  experience_years: number;
  emergency_contact: string;
  emergency_phone: string;
  department?: string;
  designation?: string;
};

const PAGE_SIZE = 10;

export default function DriversPage() {
  const [token, setToken] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DriverStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      await fetchDrivers(token);
    };

    load();
  }, [token]);

  const fetchDrivers = async (authToken: string) => {
    try {
      setLoading(true);
      setMessage('');

      const response = await axios.get('/api/hr/employees', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { per_page: 1000 },
        validateStatus: () => true,
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }

      if (response.status >= 400) {
        setDrivers([]);
        setMessage(response.data?.message || 'Failed to load drivers.');
        return;
      }

      const payload = response.data;
      const employees: any[] = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);

      const hasDriverRole = (text: string): boolean => {
        const normalized = text.toLowerCase();
        if (!normalized.includes('driver')) return false;

        const excludedTerms = ['helper', 'assistant', 'attendant', 'loader', 'clerk'];
        return !excludedTerms.some((term) => normalized.includes(term));
      };

      const driverCandidates = employees.filter((emp) => {
        const designationName = String(emp?.designation?.name || emp?.designation_name || emp?.designation || '').trim();
        const positionName = String(emp?.position || emp?.job_title || emp?.title || '').trim();
        const roleNames = Array.isArray(emp?.roles)
          ? emp.roles.map((role: any) => String(role?.name || role || '')).join(' ')
          : String(emp?.role || '');

        return [designationName, positionName, roleNames].some((value) => hasDriverRole(value));
      });

      const normalized: Driver[] = driverCandidates
        .map((emp) => {
          const firstName = String(emp?.first_name || '').trim();
          const lastName = String(emp?.last_name || '').trim();
          const displayName = `${firstName} ${lastName}`.trim() || String(emp?.name || 'Unknown Driver');

          const rawStatus = String(emp?.status || '').toLowerCase();
          const status: DriverStatus = rawStatus === 'suspended'
            ? 'suspended'
            : rawStatus === 'active'
              ? 'active'
              : 'inactive';

          const rawLicenseType = String(emp?.license_type || '').toLowerCase();
          const licenseType: LicenseType = rawLicenseType === 'light' || rawLicenseType === 'special'
            ? rawLicenseType
            : 'heavy';

          return {
            id: Number(emp?.id || 0),
            name: displayName,
            employee_id: String(emp?.employee_id || emp?.employee_code || '-'),
            license_number: String(emp?.driving_license || emp?.license_number || '-'),
            license_type: licenseType,
            license_expiry: String(emp?.license_expiry || ''),
            phone: String(emp?.phone || emp?.mobile || '-'),
            email: String(emp?.email || '-'),
            status,
            experience_years: Number(emp?.experience_years || 0),
            emergency_contact: String(emp?.emergency_contact || '-'),
            emergency_phone: String(emp?.emergency_phone || '-'),
            department: String(emp?.department?.name || emp?.department_name || '-'),
            designation: String(emp?.designation?.name || emp?.designation_name || '-'),
          };
        })
        .filter((driver) => driver.id > 0);

      setDrivers(normalized);
    } catch (error) {
      console.error('Error fetching drivers:', error);
      setDrivers([]);
      setMessage('Unable to load drivers right now.');
    } finally {
      setLoading(false);
    }
  };

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const searchText = `${driver.name} ${driver.employee_id} ${driver.license_number} ${driver.phone}`.toLowerCase();
      const matchesSearch = searchText.includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || driver.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [drivers, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredDrivers.slice(start, start + PAGE_SIZE);
  }, [filteredDrivers, currentPage]);

  const visiblePages = useMemo(() => {
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const rowStart = filteredDrivers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rowEnd = Math.min(currentPage * PAGE_SIZE, filteredDrivers.length);

  const isLicenseExpired = (value: string): boolean => {
    if (!value) return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date < new Date();
  };

  const activeCount = drivers.filter((driver) => driver.status === 'active').length;

  const expiringSoonCount = drivers.filter((driver) => {
    if (!driver.license_expiry) return false;
    const expiryDate = new Date(driver.license_expiry);
    if (!Number.isFinite(expiryDate.getTime())) return false;
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  }).length;

  const expiredCount = drivers.filter((driver) => isLicenseExpired(driver.license_expiry)).length;

  const averageExperience = drivers.length
    ? Math.round(drivers.reduce((sum, driver) => sum + Number(driver.experience_years || 0), 0) / drivers.length)
    : 0;

  const getStatusClass = (status: DriverStatus): string => {
    if (status === 'active') return 'border border-emerald-200 bg-emerald-100 text-emerald-700';
    if (status === 'suspended') return 'border border-rose-200 bg-rose-100 text-rose-700';
    return 'border border-slate-200 bg-slate-100 text-slate-700';
  };

  const getLicenseTypeClass = (type: LicenseType): string => {
    if (type === 'light') return 'border border-cyan-200 bg-cyan-100 text-cyan-700';
    if (type === 'special') return 'border border-indigo-200 bg-indigo-100 text-indigo-700';
    return 'border border-amber-200 bg-amber-100 text-amber-700';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_100%)]">
        <div className="h-14 w-14 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_55%,_#f8fafc_100%)]" />

      <section className="rounded-[28px] border border-white/70 bg-white/85 px-6 py-6 shadow-[0_26px_90px_-45px_rgba(16,185,129,0.5)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Drivers Management</h1>
            <p className="mt-1 text-sm text-slate-600">Live drivers synced from HR employees with transport-related roles.</p>
          </div>
          <div className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            HR Linked
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
      )}

      <section className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_18px_65px_-35px_rgba(30,64,175,0.45)] backdrop-blur-lg">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Drivers</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, employee ID, license, or phone"
              className="w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | DriverStatus)}
              className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-[0_18px_65px_-35px_rgba(16,185,129,0.45)] backdrop-blur-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Drivers Table</h2>
          <div className="text-sm text-slate-600">Showing {rowStart} to {rowEnd} of {filteredDrivers.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Driver Info</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Employee ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">License Details</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Department</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedDrivers.map((driver) => (
                <tr key={driver.id} className="transition hover:bg-emerald-50/35">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                        DR
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-semibold text-slate-900">{driver.name}</div>
                        <div className="text-xs text-slate-500">{driver.designation || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">{driver.employee_id}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-slate-900">{driver.license_number}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${getLicenseTypeClass(driver.license_type)}`}>
                        {driver.license_type}
                      </span>
                      <span className={`text-xs ${isLicenseExpired(driver.license_expiry) ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
                        Exp: {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    <div>{driver.department || '-'}</div>
                    <div className="text-xs text-slate-400">{Number(driver.experience_years || 0)} yrs exp</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getStatusClass(driver.status)}`}>
                      {driver.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    <div>{driver.phone || '-'}</div>
                    <div className="text-xs text-slate-400">{driver.email || '-'}</div>
                  </td>
                </tr>
              ))}

              {paginatedDrivers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <div className="text-base font-medium text-slate-800">No Drivers Found</div>
                    <p className="mt-1 text-sm text-slate-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Try adjusting your search or filter criteria.'
                        : 'No drivers are currently assigned to transport or logistics roles.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">Page {currentPage} of {totalPages}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            {visiblePages.map((pageNo) => (
              <button
                key={pageNo}
                type="button"
                onClick={() => setCurrentPage(pageNo)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  currentPage === pageNo
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {pageNo}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Active Drivers</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{activeCount}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">License Expiring Soon</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{expiringSoonCount}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Expired Licenses</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{expiredCount}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Avg Experience</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{averageExperience} yrs</p>
        </div>
      </section>
    </div>
  );
}
