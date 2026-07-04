'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

export default function StockManagement() {
  const [token, setToken] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [lowStockItems, setLowStockItems] = useState(0);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [outOfStockItems, setOutOfStockItems] = useState(0);
  const [loading, setLoading] = useState(true);
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

      const [inventoryResponse, suppliersResponse] = await Promise.all([
        axios.get('/api/stock/inventory', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        }),
        axios.get('/api/stock/suppliers', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        })
      ]);

      const inventoryItems = inventoryResponse.data?.success
        ? (inventoryResponse.data?.data?.data || inventoryResponse.data?.data || [])
        : [];

      const suppliers = suppliersResponse.data?.success
        ? (suppliersResponse.data?.data?.data || suppliersResponse.data?.data || [])
        : [];

      const lowStockCount = inventoryItems.filter((item: any) => {
        const currentStock = Number(item.current_stock) || 0;
        const minimumStock = Number(item.minimum_stock) || 0;
        return currentStock <= minimumStock;
      }).length;

      const outOfStockCount = inventoryItems.filter((item: any) => (Number(item.current_stock) || 0) <= 0).length;

      setTotalItems(inventoryItems.length);
      setLowStockItems(lowStockCount);
      setTotalSuppliers(suppliers.length);
      setOutOfStockItems(outOfStockCount);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setTotalItems(0);
      setLowStockItems(0);
      setTotalSuppliers(0);
      setOutOfStockItems(0);
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Stock Management Dashboard
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Monitor and manage your inventory, suppliers, and stock levels.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">📦</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Items
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalItems.toLocaleString()}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">⚠️</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Low Stock Items
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {lowStockItems}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">🚚</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Suppliers
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalSuppliers}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">❌</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Out of Stock
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {outOfStockItems}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Link
              href="/dashboard/stock/inventory"
              className="relative block w-full bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">📦</span>
                <span className="text-sm font-medium text-orange-900">View Inventory</span>
              </div>
            </Link>

            <Link
              href="/dashboard/stock/suppliers"
              className="relative block w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">🚚</span>
                <span className="text-sm font-medium text-blue-900">Manage Suppliers</span>
              </div>
            </Link>

            <Link
              href="/dashboard/stock/levels"
              className="relative block w-full bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">📊</span>
                <span className="text-sm font-medium text-green-900">Check Stock Levels</span>
              </div>
            </Link>

            <Link
              href="/dashboard/stock/reports"
              className="relative block w-full bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">📈</span>
                <span className="text-sm font-medium text-purple-900">Generate Reports</span>
              </div>
            </Link>

            <Link
              href="/dashboard/stock/transfers"
              className="relative block w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">🔄</span>
                <span className="text-sm font-medium text-indigo-900">Transfer to Outlets</span>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Activity
          </h3>
          <div className="text-center py-8">
            <div className="text-gray-400 text-sm">
              Recent stock activities will appear here
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}