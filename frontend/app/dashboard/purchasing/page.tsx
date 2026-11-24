'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from '@/lib/http';
import { useRouter } from 'next/navigation';

export default function PurchasingPage() {
  const [stats, setStats] = useState({
    purchaseOrders: 0,
    suppliers: 0,
    inventoryItems: 0,
  });
  const [token, setToken] = useState('');
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const router = useRouter();

  // Widgets hidden earlier by a super admin stay hidden.
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  const fetchWidgetVisibility = useCallback(async (authToken: string) => {
    if (!authToken) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
    } catch {
      setWidgetVisibility({});
    }
  }, []);

  const fetchStats = useCallback(async () => {
    if (!token) return;

    try {
      const [ordersRes, suppliersRes, inventoryRes] = await Promise.all([
        axios.get('/api/purchasing/purchase-orders', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get('/api/stock/suppliers', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 100 },
        }),
        axios.get('/api/stock/inventory', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 100 },
        }),
      ]);

      const purchaseOrders = ordersRes.data?.data || ordersRes.data || [];
      const suppliers = suppliersRes.data?.success ? (suppliersRes.data?.data?.data || suppliersRes.data?.data || []) : [];
      const inventoryItems = inventoryRes.data?.success ? (inventoryRes.data?.data?.data || []) : [];

      setStats({
        purchaseOrders: purchaseOrders.length,
        suppliers: suppliers.length,
        inventoryItems: inventoryItems.length,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({
        purchaseOrders: 0,
        suppliers: 0,
        inventoryItems: 0,
      });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchStats();
    fetchWidgetVisibility(token);
  }, [token, fetchStats, fetchWidgetVisibility]);

  const sections = [
    {
      title: 'Purchase Orders',
      description: 'Create and manage purchase orders for raw materials, finished products, and office assets.',
      href: '/dashboard/purchasing/purchase-orders',
      icon: '📋',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Goods Received Notes',
      description: 'Record and track goods received against purchase orders with quality checks and inventory updates.',
      href: '/dashboard/purchasing/grn',
      icon: '📦',
      color: 'from-green-500 to-emerald-500',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full py-8 px-3 sm:px-4 lg:px-6 space-y-8">
        {isWidgetVisible('purchasing-sections-grid') && <section className="rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-200 hover:border-gray-300 overflow-hidden"
              >
                <div className="p-6">
                  <div className={`w-12 h-12 bg-gradient-to-r ${section.color} rounded-lg flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {section.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{section.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{section.description}</p>
                  <div className="mt-4 flex items-center text-sm text-blue-600 group-hover:text-blue-700">
                    <span>Access {section.title}</span>
                    <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>}

        {isWidgetVisible('purchasing-overview-card') && <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Purchasing / Procurement Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">{stats.purchaseOrders}</div>
              <div className="text-sm text-gray-600">Active Purchase Orders</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">{stats.suppliers}</div>
              <div className="text-sm text-gray-600">Total Suppliers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">{stats.inventoryItems}</div>
              <div className="text-sm text-gray-600">Inventory Items</div>
            </div>
          </div>
        </section>}
      </div>
    </div>
  );
}
