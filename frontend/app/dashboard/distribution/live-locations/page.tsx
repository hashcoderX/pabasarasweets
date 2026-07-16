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
          <Link href="/dashboard/distribution" className="text-sm font-medium text-gray-700 hover:text-cyan-700">
            ← Back to Distribution
          </Link>
          <div className="text-xs font-semibold text-cyan-700 uppercase tracking-[0.18em]">Live Location</div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rounded-2xl border border-cyan-100 bg-white/90 shadow-xl p-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Live Ref Location Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? 'Admin view: monitor all active ref locations on Google Maps in near real-time.'
              : 'Ref view: share your live location continuously so admin can monitor your route.'}
          </p>
          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
          ) : null}
        </section>

        {!isAdmin ? (
          <section className="rounded-2xl border border-emerald-100 bg-white/90 shadow-xl p-5">
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
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-cyan-100 bg-white/90 shadow-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">Google Map - All Ref Locations</h2>
                <button
                  type="button"
                  onClick={() => fetchAllLocations(token)}
                  className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                >
                  Refresh
                </button>
              </div>

              {!googleMapsKey ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Google Maps key missing. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to frontend env to render map.
                </p>
              ) : (
                <div ref={mapNodeRef} className="h-[420px] w-full rounded-xl border border-cyan-100" />
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white/95 shadow-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Latest Ref Positions</h3>
                <span className="text-xs text-slate-500">{sortedLocations.length} refs</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Ref</th>
                      <th className="px-4 py-2 text-left">Code</th>
                      <th className="px-4 py-2 text-right">Latitude</th>
                      <th className="px-4 py-2 text-right">Longitude</th>
                      <th className="px-4 py-2 text-right">Accuracy</th>
                      <th className="px-4 py-2 text-left">Updated</th>
                    </tr>
                  </thead>
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
            </section>
          </>
        )}

        {loading && (
          <div className="text-sm text-slate-500">Loading live location module...</div>
        )}
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
