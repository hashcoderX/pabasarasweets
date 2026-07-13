'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from '@/lib/http';

type LoyaltyCustomer = {
  id: number;
  customer_code: string;
  name: string;
  phone: string;
  email?: string | null;
  points_balance: number;
  total_visits: number;
  total_spent: number;
  status: string;
  created_at?: string;
};

function OutletLoyaltyCustomersContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outletName, setOutletName] = useState('Outlet');
  const [outletCode, setOutletCode] = useState('-');
  const [outletId, setOutletId] = useState<number | null>(null);
  const [rows, setRows] = useState<LoyaltyCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [notes, setNotes] = useState('');

  const router = useRouter();
  const params = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const getPathWithCode = (path: string) => {
    const outletCode = params.get('outlet_code') || '';
    return `${path}${outletCode ? `?outlet_code=${encodeURIComponent(outletCode)}` : ''}`;
  };

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos/loyalty-customers'))}`);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos/loyalty-customers'))}`);
      return;
    }

    setToken(storedToken);
  }, [router, params]);

  const loadData = async (authToken: string) => {
    const meRes = await axios.get(`${API_URL}/api/outlet-pos/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      validateStatus: () => true,
    });

    if (meRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (meRes.status >= 400) {
      setMessage(meRes.data?.message || 'Failed to load outlet profile.');
      return false;
    }

    const outlet = meRes.data?.data?.outlet;
    if (!outlet) {
      redirectToLoginWithNext();
      return false;
    }

    const outletIdValue = Number(outlet.id) || null;
    setOutletId(outletIdValue);
    setOutletName(outlet.name || 'Outlet');
    setOutletCode(outlet.code || '-');

    const listRes = await axios.get(`${API_URL}/api/outlet-pos/loyalty-customers`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        outlet_id: outletIdValue,
        search: search || undefined,
        per_page: 50,
      },
      validateStatus: () => true,
    });

    if (listRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (listRes.status >= 400) {
      setRows([]);
      setMessage(listRes.data?.message || 'Failed to load loyalty customers.');
      return false;
    }

    setRows(Array.isArray(listRes.data?.data?.data) ? listRes.data.data.data : []);
    return true;
  };

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        setMessage('');
        await loadData(token);
      } catch (error: any) {
        console.error('Error loading loyalty customers:', error);
        setMessage(error?.response?.data?.message || 'Failed to load loyalty customers.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, search, API_URL, params, router]);

  const handleCreate = async () => {
    if (!token || !outletId) return;
    if (!name.trim() || !phone.trim()) {
      alert('Name and phone are required.');
      return;
    }

    try {
      setSaving(true);
      const res = await axios.post(
        `${API_URL}/api/outlet-pos/loyalty-customers`,
        {
          outlet_id: outletId,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          birthday: birthday || null,
          notes: notes.trim() || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        }
      );

      if (res.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (res.status >= 400) {
        const apiMessage = res.data?.message || 'Failed to create loyalty customer.';
        const errors = (res.data?.errors || {}) as Record<string, string[]>;
        const firstError = Object.values(errors)?.[0]?.[0];
        alert(firstError || apiMessage);
        return;
      }

      setName('');
      setPhone('');
      setEmail('');
      setBirthday('');
      setNotes('');
      setMessage('Loyalty customer added successfully.');
      await loadData(token);
    } catch (error: any) {
      console.error('Error creating loyalty customer:', error);
      alert(error?.response?.data?.message || 'Failed to create loyalty customer.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
      </div>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">Loyalty Customers</h1>
              <p className="text-sm text-gray-600">{outletName} ({outletCode})</p>
            </div>
            <Link
              href={getPathWithCode('/outlet-pos')}
              className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
            >
              Back To Dashboard
            </Link>
          </div>
        </section>

        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
        )}

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Loyalty Customer</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black lg:col-span-2" />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-md text-sm font-medium hover:from-amber-700 hover:to-orange-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add Loyalty Customer'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Customer List</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, name, phone"
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            />
          </div>

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Points</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Visits</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No loyalty customers found.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.customer_code}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 font-medium">{row.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.phone}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.email || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(row.points_balance || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(row.total_visits || 0)}</td>
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

export default function OutletLoyaltyCustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
        </div>
      }
    >
      <OutletLoyaltyCustomersContent />
    </Suspense>
  );
}
