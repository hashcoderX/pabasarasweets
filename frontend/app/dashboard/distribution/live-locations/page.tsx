'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type LiveLocationRow = {
  id: number;
  user_id: number;
  employee_id?: number | null;
  ref_name: string;
  ref_code?: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  captured_at?: string | null;
  updated_at?: string | null;
};
type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

export default function DistributionLiveLocationsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [locations, setLocations] = useState<LiveLocationRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [lastPingAt, setLastPingAt] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<'idle' | 'starting' | 'active'>('idle');
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const pingBusyRef = useRef(false);
  const lastPingMsRef = useRef(0);

  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      const aTime = new Date(a.captured_at || a.updated_at || 0).getTime();
      const bTime = new Date(b.captured_at || b.updated_at || 0).getTime();
      return bTime - aTime;
    });
  }, [locations]);

  const liveLocationWidgetItems = [
    { id: 'distribution-live-locations-nav-back-button', name: 'Live Locations Back Button' },
    { id: 'distribution-live-locations-hero-card', name: 'Live Locations Hero Card' },
    { id: 'distribution-live-locations-tracking-card', name: 'Live Locations Tracking Card' },
    { id: 'distribution-live-locations-map-card', name: 'Live Locations Map Card' },
    { id: 'distribution-live-locations-table-card', name: 'Live Locations Table Card' },
    { id: 'distribution-live-locations-table-headings', name: 'Live Locations Table Headings' },
  ];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = liveLocationWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  const fetchWidgetVisibility = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
      setWidgetControlsLocked(Boolean(response.data?.data?.widget_controls_locked));
    } catch {
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  };

  const stageWidgetVisibilityChange = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: isVisible }));
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== widgetKey);
      return [...remaining, { widget_key: widgetKey, is_visible: isVisible }];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) setWidgetVisibility(widgetVisibilitySnapshot);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const openSuperAdminConfirmation = (changes: WidgetVisibilityChange[] = [], mode: SuperAdminModalMode = 'apply') => {
    if (mode !== 'unlock' && !changes.length) return;
    setSuperAdminModalMode(mode);
    setPendingWidgetChanges(changes);
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    setShowSuperAdminConfirmModal(true);
  };

  const applyWidgetVisibilityChanges = async () => {
    if (superAdminModalMode !== 'apply' || !pendingWidgetChanges.length || !token) return;
    if (!superAdminEmail.trim() || !superAdminPassword) return;
    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await axios.put('/api/dashboard/widgets/me', {
          widget_key: change.widget_key,
          is_visible: change.is_visible,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      }
      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreHiddenWidgetsAfterFix = () => {
    const hiddenKeys = liveLocationWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) return;
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: widgetKey,
        is_visible: true,
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: true,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = liveLocationWidgetItems[0]?.id || 'distribution-live-locations-nav-back-button';
    try {
      setSuperAdminConfirmLoading(true);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: fallbackWidgetKey,
        is_visible: isWidgetVisible(fallbackWidgetKey),
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

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

    const bootstrap = async () => {
      try {
        setLoading(true);
        setErrorMessage('');
        await fetchWidgetVisibility(token);

        const userRes = await axios.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((r: any) => String(r?.name || r || ''))
            : []),
        ]
          .join(' ')
          .toLowerCase();

        const adminUser = !employeeId || roleNames.includes('super admin') || roleNames.includes('admin');
        setIsAdmin(adminUser);

        if (adminUser) {
          await fetchAllLocations(storedTokenOr(token));
        }
      } catch (error) {
        console.error('Error loading live location page:', error);
        setErrorMessage('Failed to load user access for live location module.');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [token]);

  useEffect(() => {
    if (!isAdmin || !token) return;

    const timer = setInterval(() => {
      fetchAllLocations(token);
    }, 10000);

    return () => clearInterval(timer);
  }, [isAdmin, token]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!googleMapsKey) return;

    let cancelled = false;

    const loadMap = async () => {
      try {
        await ensureGoogleMapsLoaded(googleMapsKey);
        if (cancelled || !mapNodeRef.current) return;

        const googleObj = (window as any).google;
        mapRef.current = new googleObj.maps.Map(mapNodeRef.current, {
          center: { lat: 7.8731, lng: 80.7718 },
          zoom: 8,
          mapTypeControl: true,
          streetViewControl: false,
        });

        setMapReady(true);
      } catch (error) {
        console.error('Failed loading Google Maps:', error);
        setErrorMessage('Failed to load Google Maps. Check API key and network access.');
      }
    };

    loadMap();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, googleMapsKey]);

  useEffect(() => {
    if (!isAdmin || !mapReady || !mapRef.current) return;

    const googleObj = (window as any).google;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new googleObj.maps.LatLngBounds();

    sortedLocations.forEach((row) => {
      const marker = new googleObj.maps.Marker({
        map: mapRef.current,
        position: { lat: Number(row.latitude), lng: Number(row.longitude) },
        title: `${row.ref_name}${row.ref_code ? ` (${row.ref_code})` : ''}`,
      });

      const infoWindow = new googleObj.maps.InfoWindow({
        content: `<div style="font-size:12px;line-height:1.4;"><strong>${escapeHtml(row.ref_name)}</strong><br/>${row.ref_code ? `Code: ${escapeHtml(row.ref_code)}<br/>` : ''}Lat: ${Number(row.latitude).toFixed(6)}<br/>Lng: ${Number(row.longitude).toFixed(6)}<br/>Updated: ${new Date(row.captured_at || row.updated_at || '').toLocaleString()}</div>`,
      });

      marker.addListener('click', () => infoWindow.open({ map: mapRef.current, anchor: marker }));
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
    });

    if (sortedLocations.length > 0) {
      mapRef.current.fitBounds(bounds);
    }
  }, [isAdmin, mapReady, sortedLocations]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const fetchAllLocations = async (authToken: string) => {
    try {
      const res = await axios.get('/api/distribution/live-locations', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setLocations(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        setErrorMessage('Only admin users can view all ref live locations.');
      } else {
        console.error('Error fetching all live locations:', error);
      }
    }
  };

  const sendPing = async (position: GeolocationPosition) => {
    if (!token || pingBusyRef.current) return;

    const now = Date.now();
    if (now - lastPingMsRef.current < 8000) return;

    pingBusyRef.current = true;
    try {
      await axios.post(
        '/api/distribution/live-locations/ping',
        {
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracy: Number.isFinite(position.coords.accuracy) ? Number(position.coords.accuracy) : null,
          heading: Number.isFinite(position.coords.heading ?? NaN) ? Number(position.coords.heading) : null,
          speed: Number.isFinite(position.coords.speed ?? NaN) ? Number(position.coords.speed) : null,
          captured_at: new Date().toISOString(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      lastPingMsRef.current = now;
      setLastPingAt(new Date().toLocaleTimeString());
      setTrackingStatus('active');
      setErrorMessage('');
    } catch (error) {
      console.error('Error sending live location ping:', error);
      setErrorMessage('Failed to send location update. Check internet and permissions.');
    } finally {
      pingBusyRef.current = false;
    }
  };

  const startTracking = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage('Geolocation is not available on this device/browser.');
      return;
    }

    if (watchIdRef.current !== null) {
      setTrackingStatus('active');
      return;
    }

    setTrackingStatus('starting');
    setErrorMessage('');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        sendPing(position);
      },
      (error) => {
        console.error('Live tracking error:', error);
        const message =
          error.code === 1
            ? 'Location permission denied. Please allow GPS access.'
            : error.code === 2
              ? 'Unable to detect your location. Move to open sky and retry.'
              : 'Location timeout. Please retry.';
        setTrackingStatus('idle');
        setErrorMessage(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTrackingStatus('idle');
  };

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-emerald-50">
      <nav className="bg-white/85 backdrop-blur-lg shadow-sm border-b border-white/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isWidgetVisible('distribution-live-locations-nav-back-button') && <Link href="/dashboard/distribution" className="text-sm font-medium text-gray-700 hover:text-cyan-700">
              ← Back to Distribution
            </Link>}
            {!widgetControlsLocked && isWidgetVisible('distribution-live-locations-nav-back-button') && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-live-locations-nav-back-button', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>
          <div className="text-xs font-semibold text-cyan-700 uppercase tracking-[0.18em]">Live Location</div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Widget Controls</h3>
              <p className="text-xs text-slate-500">Hide widgets, fix controls, restore hidden widgets, and unlock controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')} disabled={widgetControlsLocked || pendingWidgetChanges.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Fix Widgets</button>
              <button type="button" onClick={restoreHiddenWidgetsAfterFix} disabled={hiddenWidgetCount === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Restore Widgets</button>
              <button type="button" onClick={openUnlockWidgetsAfterFix} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">Unlock Widgets</button>
            </div>
          </div>
        </section>

        {isWidgetVisible('distribution-live-locations-hero-card') && <section className="rounded-2xl border border-cyan-100 bg-white/90 shadow-xl p-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Live Ref Location Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? 'Admin view: monitor all active ref locations on Google Maps in near real-time.'
              : 'Ref view: share your live location continuously so admin can monitor your route.'}
          </p>
          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
          ) : null}
          {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('distribution-live-locations-hero-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </section>}

        {!isAdmin ? (
          isWidgetVisible('distribution-live-locations-tracking-card') && <section className="rounded-2xl border border-emerald-100 bg-white/90 shadow-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">Share My Live Location</h2>
            <p className="text-sm text-slate-600 mt-1">Keep this page open while delivering to send periodic GPS updates.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startTracking}
                disabled={trackingStatus === 'active'}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {trackingStatus === 'starting' ? 'Starting...' : 'Start Live Tracking'}
              </button>
              <button
                type="button"
                onClick={stopTracking}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Stop Tracking
              </button>
              <span className={`text-xs font-semibold ${trackingStatus === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}>
                Status: {trackingStatus === 'active' ? 'ACTIVE' : trackingStatus.toUpperCase()}
              </span>
            </div>
            {lastPingAt ? (
              <p className="mt-2 text-xs text-slate-500">Last update sent at {lastPingAt}</p>
            ) : null}
            {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('distribution-live-locations-tracking-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
          </section>
        ) : (
          <>
            {isWidgetVisible('distribution-live-locations-map-card') && <section className="rounded-2xl border border-cyan-100 bg-white/90 shadow-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">Google Map - All Ref Locations</h2>
                <div className="flex items-center gap-2"><button
                    type="button"
                    onClick={() => fetchAllLocations(token)}
                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                  >
                    Refresh
                  </button>{!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-live-locations-map-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}</div>
              </div>

              {!googleMapsKey ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Google Maps key missing. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to frontend env to render map.
                </p>
              ) : (
                <div ref={mapNodeRef} className="h-[420px] w-full rounded-xl border border-cyan-100" />
              )}
            </section>}

            {isWidgetVisible('distribution-live-locations-table-card') && <section className="rounded-2xl border border-slate-200 bg-white/95 shadow-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Latest Ref Positions</h3>
                <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{sortedLocations.length} refs</span>{!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-live-locations-table-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  {isWidgetVisible('distribution-live-locations-table-headings') && <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Ref</th>
                      <th className="px-4 py-2 text-left">Code</th>
                      <th className="px-4 py-2 text-right">Latitude</th>
                      <th className="px-4 py-2 text-right">Longitude</th>
                      <th className="px-4 py-2 text-right">Accuracy</th>
                      <th className="px-4 py-2 text-left">Updated</th>
                    </tr>
                  </thead>}
                  <tbody className="divide-y divide-slate-100">
                    {sortedLocations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No live locations received yet.</td>
                      </tr>
                    ) : (
                      sortedLocations.map((row) => (
                        <tr key={row.id} className="hover:bg-cyan-50/50">
                          <td className="px-4 py-2 font-medium text-slate-800">{row.ref_name}</td>
                          <td className="px-4 py-2 text-slate-600">{row.ref_code || '-'}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{Number(row.latitude).toFixed(6)}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{Number(row.longitude).toFixed(6)}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{row.accuracy != null ? `${Number(row.accuracy).toFixed(1)} m` : '-'}</td>
                          <td className="px-4 py-2 text-slate-600">{new Date(row.captured_at || row.updated_at || '').toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>}
          </>
        )}

        {loading && (
          <div className="text-sm text-slate-500">Loading live location module...</div>
        )}

        {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{liveLocationWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
      </main>
    </div>
  );
}

const ensureGoogleMapsLoaded = (apiKey: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const existingGoogle = (window as any).google;
    if (existingGoogle?.maps) {
      resolve();
      return;
    }

    const existingScript = document.getElementById('google-maps-script') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google Maps failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps failed to load.'));
    document.head.appendChild(script);
  });
};

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const storedTokenOr = (token: string): string => {
  if (typeof window === 'undefined') return token;
  return localStorage.getItem('token') || token;
};
