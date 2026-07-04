'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Vehicle {
  id: number;
  registration_number: string;
  type: 'truck' | 'van' | 'pickup' | 'lorry';
  capacity_kg: number;
  status: 'active' | 'maintenance' | 'inactive';
  fuel_type: 'diesel' | 'petrol' | 'electric';
  model: string;
  year: number;
  insurance_expiry: string;
  license_expiry: string;
  current_location: string;
  notes: string;
}

const PAGE_SIZE = 10;

export default function VehiclesPage() {
  const [token, setToken] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Vehicle['status']>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState({
    registration_number: '',
    type: 'truck' as Vehicle['type'],
    capacity_kg: '',
    status: 'active' as Vehicle['status'],
    fuel_type: 'diesel' as Vehicle['fuel_type'],
    model: '',
    year: '',
    insurance_expiry: '',
    license_expiry: '',
    current_location: '',
    notes: ''
  });
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchVehicles();
    }
  }, [token]);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vehicle-loading/vehicles', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setVehicles(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const vehicleData = {
        registration_number: formData.registration_number,
        type: formData.type,
        capacity_kg: parseFloat(formData.capacity_kg),
        status: formData.status,
        fuel_type: formData.fuel_type,
        model: formData.model,
        year: parseInt(formData.year),
        insurance_expiry: formData.insurance_expiry,
        license_expiry: formData.license_expiry,
        current_location: formData.current_location,
        notes: formData.notes
      };

      if (editingVehicle) {
        await axios.put(`/api/vehicle-loading/vehicles/${editingVehicle.id}`, vehicleData, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } else {
        await axios.post('/api/vehicle-loading/vehicles', vehicleData, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }

      setShowModal(false);
      setEditingVehicle(null);
      resetForm();
      fetchVehicles(); // Refresh the list
    } catch (error) {
      console.error('Error saving vehicle:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      registration_number: '',
      type: 'truck',
      capacity_kg: '',
      status: 'active',
      fuel_type: 'diesel',
      model: '',
      year: '',
      insurance_expiry: '',
      license_expiry: '',
      current_location: '',
      notes: ''
    });
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      registration_number: vehicle.registration_number,
      type: vehicle.type,
      capacity_kg: vehicle.capacity_kg.toString(),
      status: vehicle.status,
      fuel_type: vehicle.fuel_type,
      model: vehicle.model,
      year: vehicle.year.toString(),
      insurance_expiry: vehicle.insurance_expiry,
      license_expiry: vehicle.license_expiry,
      current_location: vehicle.current_location,
      notes: vehicle.notes
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this vehicle?')) {
      try {
        await axios.delete(`/api/vehicle-loading/vehicles/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        fetchVehicles(); // Refresh the list
      } catch (error) {
        console.error('Error deleting vehicle:', error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'border border-emerald-200 bg-emerald-100 text-emerald-700';
      case 'maintenance': return 'border border-amber-200 bg-amber-100 text-amber-700';
      case 'inactive': return 'border border-rose-200 bg-rose-100 text-rose-700';
      default: return 'border border-slate-200 bg-slate-100 text-slate-700';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'truck': return '🚛';
      case 'van': return '🚐';
      case 'pickup': return '🚙';
      case 'lorry': return '🚚';
      default: return '🚛';
    }
  };

  const modalInputClass = 'w-full rounded-xl border border-emerald-200/80 bg-white/90 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100';
  const modalSectionClass = 'rounded-2xl border border-white/70 bg-gradient-to-br from-white to-emerald-50/45 p-4 shadow-sm';
  const modalLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const haystack = `${vehicle.registration_number} ${vehicle.type} ${vehicle.model} ${vehicle.current_location} ${vehicle.fuel_type}`.toLowerCase();
      const matchesSearch = haystack.includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredVehicles.slice(start, start + PAGE_SIZE);
  }, [filteredVehicles, currentPage]);

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

  const rowStart = filteredVehicles.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rowEnd = Math.min(currentPage * PAGE_SIZE, filteredVehicles.length);

  const activeCount = vehicles.filter((vehicle) => vehicle.status === 'active').length;
  const maintenanceCount = vehicles.filter((vehicle) => vehicle.status === 'maintenance').length;
  const inactiveCount = vehicles.filter((vehicle) => vehicle.status === 'inactive').length;
  const totalCapacity = vehicles.reduce((sum, vehicle) => sum + Number(vehicle.capacity_kg || 0), 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_100%)]">
        <div className="h-14 w-14 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_55%,_#f8fafc_100%)]" />

      <section className="rounded-[28px] border border-white/70 bg-white/85 px-6 py-6 shadow-[0_26px_90px_-45px_rgba(16,185,129,0.5)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Vehicles Management</h1>
            <p className="mt-1 text-sm text-slate-600">Manage fleet assets, compliance dates, and availability from one modern workspace.</p>
          </div>
          <button
            onClick={() => {
              setEditingVehicle(null);
              resetForm();
              setShowModal(true);
            }}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
          >
            Add New Vehicle
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_18px_65px_-35px_rgba(30,64,175,0.45)] backdrop-blur-lg">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Vehicles</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by registration, type, model, location or fuel"
              className="w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | Vehicle['status'])}
              className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-[0_18px_65px_-35px_rgba(16,185,129,0.45)] backdrop-blur-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Vehicles List</h2>
          <div className="text-sm text-slate-600">Showing {rowStart} to {rowEnd} of {filteredVehicles.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Registration
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Type & Model
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Capacity
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Fuel Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Insurance
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  License
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {paginatedVehicles.map((vehicle) => (
                <tr key={vehicle.id} className="transition hover:bg-emerald-50/35">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">{getTypeIcon(vehicle.type)}</span>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {vehicle.registration_number}
                        </div>
                        <div className="text-xs text-slate-500">
                          {vehicle.year}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900 capitalize">{vehicle.type}</div>
                    <div className="text-xs text-slate-500">{vehicle.model}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {vehicle.capacity_kg.toLocaleString()} kg
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 capitalize">
                    {vehicle.fuel_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getStatusColor(vehicle.status)}`}>
                      {vehicle.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {vehicle.current_location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`${new Date(vehicle.insurance_expiry) < new Date() ? 'font-semibold text-rose-600' : 'text-emerald-700'}`}>
                      {new Date(vehicle.insurance_expiry).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`${new Date(vehicle.license_expiry) < new Date() ? 'font-semibold text-rose-600' : 'text-emerald-700'}`}>
                      {new Date(vehicle.license_expiry).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(vehicle)}
                      className="mr-3 text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(vehicle.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {paginatedVehicles.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center">
                    <div className="text-base font-medium text-slate-800">No Vehicles Found</div>
                    <p className="mt-1 text-sm text-slate-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Add your first vehicle to get started.'}
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
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Active Vehicles</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{activeCount}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">In Maintenance</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{maintenanceCount}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Inactive Vehicles</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{inactiveCount}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Total Capacity</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalCapacity.toLocaleString()} kg</p>
        </div>
      </section>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-5xl">
            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/90 shadow-[0_30px_120px_-50px_rgba(16,185,129,0.55)] backdrop-blur-xl">
              <div className="flex items-start justify-between border-b border-white/70 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-6 py-5 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Fleet Workspace</p>
                  <h3 className="mt-1 text-2xl font-bold">
                    {editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
                  </h3>
                  <p className="mt-1 text-sm text-emerald-50/90">Capture complete vehicle details with compliance and location data.</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingVehicle(null);
                    resetForm();
                  }}
                  className="rounded-full border border-white/40 bg-white/20 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/30"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-5 overflow-y-auto px-6 py-6">
                {/* Basic Information */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={modalLabelClass}>Registration Number</label>
                      <input
                        type="text"
                        value={formData.registration_number}
                        onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                        className={modalInputClass}
                        placeholder="TRK-001"
                        required
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>Model</label>
                      <input
                        type="text"
                        value={formData.model}
                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                        className={modalInputClass}
                        placeholder="Ashok Leyland Boss"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className={modalLabelClass}>Type</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as Vehicle['type'] })}
                        className={modalInputClass}
                      >
                        <option value="truck">Truck</option>
                        <option value="van">Van</option>
                        <option value="pickup">Pickup</option>
                        <option value="lorry">Lorry</option>
                      </select>
                    </div>
                    <div>
                      <label className={modalLabelClass}>Fuel Type</label>
                      <select
                        value={formData.fuel_type}
                        onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value as Vehicle['fuel_type'] })}
                        className={modalInputClass}
                      >
                        <option value="diesel">Diesel</option>
                        <option value="petrol">Petrol</option>
                        <option value="electric">Electric</option>
                      </select>
                    </div>
                    <div>
                      <label className={modalLabelClass}>Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as Vehicle['status'] })}
                        className={modalInputClass}
                      >
                        <option value="active">Active</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Technical Details */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Technical Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={modalLabelClass}>Capacity (kg)</label>
                      <input
                        type="number"
                        value={formData.capacity_kg}
                        onChange={(e) => setFormData({ ...formData, capacity_kg: e.target.value })}
                        className={modalInputClass}
                        placeholder="5000"
                        required
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>Year</label>
                      <input
                        type="number"
                        value={formData.year}
                        onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                        className={modalInputClass}
                        placeholder="2022"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Compliance & Location */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Compliance & Location</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={modalLabelClass}>Insurance Expiry</label>
                      <input
                        type="date"
                        value={formData.insurance_expiry}
                        onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })}
                        className={modalInputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>License Expiry</label>
                      <input
                        type="date"
                        value={formData.license_expiry}
                        onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                        className={modalInputClass}
                        required
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={modalLabelClass}>Current Location</label>
                    <input
                      type="text"
                      value={formData.current_location}
                      onChange={(e) => setFormData({ ...formData, current_location: e.target.value })}
                      className={modalInputClass}
                      placeholder="Colombo Depot"
                      required
                    />
                  </div>
                </div>

                {/* Additional Information */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Additional Information</h4>
                  <div>
                    <label className={modalLabelClass}>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={4}
                      className={modalInputClass}
                      placeholder="Enter any additional notes about this vehicle..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-200/80 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingVehicle(null);
                      resetForm();
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
                  >
                    {editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}