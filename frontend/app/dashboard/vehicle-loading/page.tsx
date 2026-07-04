'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

interface LoadItem {
  id: number;
  load_id: number;
  product_code: string;
  name: string;
  type: string;
  qty: number;
  sell_price: number;
}

export default function VehicleLoading() {
  const [token, setToken] = useState('');
  const [activeLoads, setActiveLoads] = useState(0);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [availableVehicles, setAvailableVehicles] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [activeRoutes, setActiveRoutes] = useState(0);
  const [pendingLoads, setPendingLoads] = useState(0);
  const [completedLoads, setCompletedLoads] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentLoads, setRecentLoads] = useState<any[]>([]);
  const [showLoadItemsModal, setShowLoadItemsModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<any | null>(null);
  const [selectedLoadItems, setSelectedLoadItems] = useState<LoadItem[]>([]);
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
      fetchDashboardData();
    }
  }, [token]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch vehicles data
      const vehiclesResponse = await axios.get('/api/vehicle-loading/vehicles', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const vehicles = vehiclesResponse.data || [];
      const totalVehicles = vehicles.length;
      const availableVehicles = vehicles.filter((v: any) => v.status === 'active').length;
      const totalCapacity = vehicles.reduce((sum: number, v: any) => sum + (v.capacity_kg || 0), 0);

      // Fetch loads data
      const loadsResponse = await axios.get('/api/vehicle-loading/loads', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const loads = loadsResponse.data || [];
      const activeLoads = loads.filter((l: any) => l.status === 'in_transit').length;
      const pendingLoads = loads.filter((l: any) => l.status === 'pending').length;
      const completedLoads = loads.filter((l: any) => l.status === 'delivered').length;

      // Fetch routes data
      const routesResponse = await axios.get('/api/vehicle-loading/routes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const routes = routesResponse.data || [];
      const activeRoutes = routes.length; // Assuming all routes are active

      // Fetch drivers data (employees with Driver designation)
      const employeesResponse = await axios.get('/api/hr/employees', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const employees = employeesResponse.data.data || employeesResponse.data || [];
      const totalDrivers = employees.filter((e: any) => e.designation?.name === 'Driver').length;

      // Fetch recent loads (last 5 loads)
      const recentLoadsData = loads
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      setRecentLoads(recentLoadsData);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const handleViewLoadItems = async (load: any) => {
    try {
      setShowLoadItemsModal(true);
      setModalLoading(true);
      setSelectedLoad(load);
      setSelectedLoadItems([]);

      const response = await axios.get('/api/vehicle-loading/load-items', {
        headers: { Authorization: `Bearer ${token}` },
        params: { load_id: load.id }
      });

      setSelectedLoadItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching load items:', error);
      setSelectedLoadItems([]);
    } finally {
      setModalLoading(false);
    }
  };

  const totalSelectedQty = selectedLoadItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  const getPersonName = (person: any) => {
    if (!person) return '-';
    return person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || '-';
  };

  const stats = [
    {
      name: 'Active Loads',
      value: activeLoads,
      icon: '📦',
      color: 'bg-blue-500',
      description: 'Currently in transit'
    },
    {
      name: 'Total Vehicles',
      value: totalVehicles,
      icon: '🚛',
      color: 'bg-green-500',
      description: `${availableVehicles} available`
    },
    {
      name: 'Total Drivers',
      value: totalDrivers,
      icon: '👨‍🚗',
      color: 'bg-yellow-500',
      description: 'Active drivers'
    },
    {
      name: 'Active Routes',
      value: activeRoutes,
      icon: '🗺️',
      color: 'bg-purple-500',
      description: 'Routes in operation'
    },
    {
      name: 'Pending Loads',
      value: pendingLoads,
      icon: '⏳',
      color: 'bg-orange-500',
      description: 'Awaiting dispatch'
    },
    {
      name: 'Completed Loads',
      value: completedLoads,
      icon: '✅',
      color: 'bg-indigo-500',
      description: 'This month'
    },
    {
      name: 'Total Capacity',
      value: `${totalCapacity}t`,
      icon: '⚖️',
      color: 'bg-red-500',
      description: 'Maximum load capacity'
    },
    {
      name: 'Efficiency Rate',
      value: '94%',
      icon: '📈',
      color: 'bg-teal-500',
      description: 'On-time delivery'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vehicle Loading Dashboard</h1>
        <p className="text-gray-600">Manage your fleet, loads, and logistics operations</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/vehicle-loading/loads"
            className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
          >
            <span className="text-2xl mr-3">📦</span>
            <div>
              <p className="font-medium text-gray-900">Create New Load</p>
              <p className="text-sm text-gray-600">Schedule a new delivery</p>
            </div>
          </Link>

          <Link
            href="/dashboard/vehicle-loading/vehicles"
            className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <span className="text-2xl mr-3">🚛</span>
            <div>
              <p className="font-medium text-gray-900">Add Vehicle</p>
              <p className="text-sm text-gray-600">Register new vehicle</p>
            </div>
          </Link>

          <Link
            href="/dashboard/vehicle-loading/drivers"
            className="flex items-center p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
          >
            <span className="text-2xl mr-3">👨‍🚗</span>
            <div>
              <p className="font-medium text-gray-900">Add Driver</p>
              <p className="text-sm text-gray-600">Register new driver</p>
            </div>
          </Link>

          <Link
            href="/dashboard/vehicle-loading/routes"
            className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <span className="text-2xl mr-3">🗺️</span>
            <div>
              <p className="font-medium text-gray-900">Plan Route</p>
              <p className="text-sm text-gray-600">Create delivery route</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {recentLoads.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-4xl">📦</span>
              <p className="text-gray-500 mt-2">No recent loads</p>
            </div>
          ) : (
            recentLoads.map((load) => (
              <button
                key={load.id}
                type="button"
                onClick={() => handleViewLoadItems(load)}
                className="w-full text-left flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="text-xl mr-3">
                  {load.status === 'in_transit' ? '🚛' : load.status === 'delivered' ? '✅' : load.status === 'pending' ? '⏳' : '📦'}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Load #{load.load_number}</p>
                  <p className="text-sm text-gray-600">
                    {load.vehicle?.registration_number || 'Unknown vehicle'} • 
                    {load.route?.destination || 'Unknown destination'} • 
                    {new Date(load.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Click to view item-wise available quantity in vehicle</p>
                </div>
                <span className={`text-sm font-medium ${
                  load.status === 'in_transit' ? 'text-green-600' :
                  load.status === 'delivered' ? 'text-blue-600' :
                  load.status === 'pending' ? 'text-orange-600' :
                  'text-gray-600'
                }`}>
                  {load.status === 'in_transit' ? 'In Transit' :
                   load.status === 'delivered' ? 'Completed' :
                   load.status === 'pending' ? 'Pending' :
                   load.status}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {showLoadItemsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Vehicle Load Item Availability</h3>
              <button
                type="button"
                onClick={() => {
                  setShowLoadItemsModal(false);
                  setSelectedLoad(null);
                  setSelectedLoadItems([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              {selectedLoad && (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Load Number</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedLoad.load_number}</p>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Vehicle</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedLoad.vehicle?.registration_number || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Status</p>
                    <p className="text-sm font-semibold text-gray-900">{(selectedLoad.status || '-').replace('_', ' ')}</p>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Driver</p>
                    <p className="text-sm font-semibold text-gray-900">{getPersonName(selectedLoad.driver)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Sales Ref</p>
                    <p className="text-sm font-semibold text-gray-900">{getPersonName(selectedLoad.sales_ref || selectedLoad.salesRef)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Qty</p>
                    <p className="text-sm font-semibold text-gray-900">{totalSelectedQty.toFixed(2)}</p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Code</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available Qty In Vehicle</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {modalLoading ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Loading item list...</td>
                      </tr>
                    ) : selectedLoadItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No items available for this vehicle load.</td>
                      </tr>
                    ) : (
                      selectedLoadItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-sm text-gray-700">{item.product_code}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{item.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{item.type.replace('_', ' ')}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 text-right font-medium">{Number(item.qty).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}