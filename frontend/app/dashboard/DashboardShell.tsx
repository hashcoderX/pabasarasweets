'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import axios from '@/lib/http';

type SidebarItem = {
  label: string;
  description?: string;
  href: string;
  icon: string;
  widgetKey?: string;
};

const COMPANY_PROFILE_DATA_KEY = 'company_profile_data';
const COMPANY_PROFILE_ID_KEY = 'company_profile_id';

// Logos are served from the same origin (/storage/...), exactly like the company settings page.
const resolveCompanyLogo = (company?: { logo_url?: string; logo_path?: string } | null): string => {
  const rawUrl = String(company?.logo_url || '').trim();
  const rawPath = String(company?.logo_path || '').trim();
  if (rawPath) return `/storage/${rawPath.replace(/^\/+/, '')}`;
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/storage/')) return rawUrl;
  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.pathname.startsWith('/storage/')) return parsed.pathname + (parsed.search || '');
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
};

const SIDEBAR_STATE_KEY = 'dashboard_sidebar_collapsed_v1';
const SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY = 'dashboard_sidebar_widget_visibility_v1';
const SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY = 'dashboard_widget_controls_locked_v1';
const SIDEBAR_WIDGET_STATE_CHANGED_EVENT = 'dashboard-widget-controls-updated';

const sidebarItems: SidebarItem[] = [
  { label: 'Overview', description: 'Quick dashboard summary', href: '/dashboard', icon: 'overview' },
  { label: 'Assistant', description: 'AI help and shortcuts', href: '/dashboard/assistant', icon: 'assistant', widgetKey: 'assistant' },
  { label: 'HRM', description: 'Employees, attendance, payroll', href: '/dashboard/hrm', icon: 'hrm', widgetKey: 'hrm' },
  { label: 'Production', description: 'Batches and manufacturing', href: '/dashboard/production', icon: 'production', widgetKey: 'production' },
  { label: 'Distribution', description: 'Customers and delivery sales', href: '/dashboard/distribution', icon: 'distribution', widgetKey: 'distribution' },
  { label: 'Orders', description: 'Order processing and tracking', href: '/dashboard/orders', icon: 'orders', widgetKey: 'distribution' },
  { label: 'Purchasing (procurement)', description: 'Purchase orders and GRN', href: '/dashboard/purchasing', icon: 'purchasing', widgetKey: 'purchasing' },
  { label: 'Stock', description: 'Inventory and item balances', href: '/dashboard/stock', icon: 'stock', widgetKey: 'stock' },
  { label: 'Accounts', description: 'Cash, bank, and ledger', href: '/dashboard/accounts', icon: 'accounts', widgetKey: 'accounts' },
  { label: 'Reports', description: 'Business reports and insights', href: '/dashboard/reports', icon: 'reports', widgetKey: 'reports' },
  { label: 'Vehicle Loading', description: 'Load planning and completion', href: '/dashboard/vehicle-loading', icon: 'vehicle', widgetKey: 'vehicle-loading' },
  { label: 'Outlets', description: 'Outlet operations and POS', href: '/dashboard/outlets', icon: 'outlets', widgetKey: 'outlets' },
  { label: 'Branches', description: 'Branch setup and control', href: '/dashboard/branches', icon: 'branches', widgetKey: 'branches' },
  { label: 'Settings', description: 'System configuration', href: '/dashboard/system-settings', icon: 'settings', widgetKey: 'system-settings' },
];

const SIDEBAR_ICON_TONES: Record<string, string> = {
  overview: 'from-emerald-400 to-teal-500',
  assistant: 'from-fuchsia-400 to-purple-500',
  hrm: 'from-sky-400 to-blue-500',
  production: 'from-amber-400 to-orange-500',
  distribution: 'from-cyan-400 to-sky-500',
  orders: 'from-rose-400 to-pink-500',
  purchasing: 'from-violet-400 to-indigo-500',
  stock: 'from-orange-400 to-red-500',
  accounts: 'from-emerald-400 to-green-500',
  reports: 'from-indigo-400 to-blue-600',
  vehicle: 'from-lime-400 to-emerald-500',
  outlets: 'from-pink-400 to-rose-500',
  branches: 'from-teal-400 to-cyan-500',
  settings: 'from-slate-400 to-slate-600',
};

function SidebarIcon({ icon }: { icon: string }) {
  const baseClass = 'h-4 w-4';

  switch (icon) {
    case 'overview':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z" />
        </svg>
      );
    case 'hrm':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M23 11h-6" />
        </svg>
      );
    case 'production':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M14.7 6.3a1 1 0 0 0-1.4 0L10 9.6l-1.3-1.3a1 1 0 0 0-1.4 1.4L8.6 11l-1.3 1.3a1 1 0 0 0 1.4 1.4L10 12.4l3.3 3.3a1 1 0 1 0 1.4-1.4L11.4 11l3.3-3.3a1 1 0 0 0 0-1.4Z" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case 'distribution':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M1 3h15v13H1z" />
          <path d="M16 8h4l3 3v5h-7z" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case 'orders':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case 'purchasing':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M6 2h12l1 4H5l1-4Z" />
          <path d="M4 6h16l-1 14H5L4 6Z" />
          <path d="M9 10h6" />
        </svg>
      );
    case 'stock':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M3 7 12 2l9 5-9 5-9-5Z" />
          <path d="M3 12l9 5 9-5" />
          <path d="M3 17l9 5 9-5" />
        </svg>
      );
    case 'accounts':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M3 5h18v14H3z" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      );
    case 'reports':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M4 19V5" />
          <path d="M10 19V9" />
          <path d="M16 19V13" />
          <path d="M22 19H2" />
        </svg>
      );
    case 'vehicle':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M3 13h18l-2-6H5l-2 6Z" />
          <path d="M5 13v5m14-5v5" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case 'outlets':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M3 9 5 3h14l2 6" />
          <path d="M4 9h16v12H4z" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    case 'branches':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2 2 0 1 1-4 0v-.09A1.8 1.8 0 0 0 8.8 19.3a1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-1.98 1.8 1.8 0 0 0-1.65-1.1H2.6a2 2 0 1 1 0-4h.09A1.8 1.8 0 0 0 4.34 8.1 1.8 1.8 0 0 0 3.98 6.1l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.09-1.64V2.9a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.09h.09a2 2 0 1 1 0 4h-.09a1.8 1.8 0 0 0-1.65 1.1Z" />
        </svg>
      );
    case 'assistant':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <path d="M12 3a5 5 0 0 0-5 5v2.2a3 3 0 0 0-2 2.8v2a3 3 0 0 0 3 3h1.5l1.2 2.1c.3.5 1 .5 1.3 0L13.2 18H16a3 3 0 0 0 3-3v-2a3 3 0 0 0-2-2.8V8a5 5 0 0 0-5-5Z" />
          <circle cx="10" cy="13" r="1" />
          <circle cx="14" cy="13" r="1" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={baseClass}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [companyLogoFailed, setCompanyLogoFailed] = useState(false);

  useEffect(() => {
    let active = true;

    try {
      const cached = JSON.parse(localStorage.getItem(COMPANY_PROFILE_DATA_KEY) || 'null');
      const cachedLogo = resolveCompanyLogo(cached);
      if (cachedLogo) setCompanyLogoUrl(cachedLogo);
    } catch {
      // Ignore invalid cached company profile.
    }

    const loadCompanyLogo = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) return;
      try {
        const response = await axios.get('/api/companies', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const payload = response?.data;
        const companies = (Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []) as Array<{
          id?: number | string;
          logo_url?: string;
          logo_path?: string;
        }>;
        const profileId = Number(localStorage.getItem(COMPANY_PROFILE_ID_KEY) || 0);
        const company = companies.find((row) => Number(row?.id || 0) === profileId) || companies[0];
        if (!active || !company) return;
        const logo = resolveCompanyLogo(company);
        setCompanyLogoFailed(false);
        setCompanyLogoUrl(logo);
      } catch {
        // Keep cached logo or the default badge.
      }
    };

    void loadCompanyLogo();
    return () => {
      active = false;
    };
  }, []);
  const [authToken, setAuthToken] = useState('');
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(true);
  const [widgetLoading, setWidgetLoading] = useState(true);
  const [closingWidgetKeys, setClosingWidgetKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      setSidebarCollapsed(saved === '1');
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore storage issues for layout preferences.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    const loadWidgetVisibility = async () => {
      try {
        const cachedLocked = localStorage.getItem(SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY);
        if (cachedLocked === '0' || cachedLocked === '1') {
          setWidgetControlsLocked(cachedLocked === '1');
        }
      } catch {
        // Ignore cached lock read failures.
      }

      try {
        const cached = localStorage.getItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, boolean>;
          if (active && parsed && typeof parsed === 'object') {
            setWidgetVisibility(parsed);
            setWidgetLoading(false);
          }
        }
      } catch {
        // Ignore invalid local cache and continue with API fetch.
      }

      try {
        const storedToken = localStorage.getItem('token');
        setAuthToken(storedToken || '');
        if (!storedToken) {
          if (active) setWidgetLoading(false);
          return;
        }

        const response = await axios.get('/api/dashboard/widgets/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const nextVisibility = response.data?.data?.widgets || {};
        const nextControlsLocked = Boolean(response.data?.data?.widget_controls_locked);

        if (!active) return;
        setWidgetVisibility(nextVisibility);
        setWidgetControlsLocked(nextControlsLocked);
        setWidgetLoading(false);

        try {
          localStorage.setItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY, JSON.stringify(nextVisibility));
          localStorage.setItem(SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY, nextControlsLocked ? '1' : '0');
        } catch {
          // Ignore storage failures.
        }
      } catch {
        if (active) setWidgetControlsLocked(true);
        if (active) setWidgetLoading(false);
      }
    };

    void loadWidgetVisibility();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const cachedLocked = localStorage.getItem(SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY);
        if (cachedLocked === '0' || cachedLocked === '1') {
          setWidgetControlsLocked(cachedLocked === '1');
        }
      } catch {
        // Ignore sync failures.
      }

      try {
        const cachedVisibility = localStorage.getItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY);
        if (!cachedVisibility) return;
        const parsed = JSON.parse(cachedVisibility) as Record<string, boolean>;
        if (parsed && typeof parsed === 'object') {
          setWidgetVisibility(parsed);
        }
      } catch {
        // Ignore sync failures.
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === SIDEBAR_WIDGET_CONTROLS_LOCKED_KEY ||
        event.key === SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY
      ) {
        syncFromStorage();
      }
    };

    const handleWidgetStateChanged = () => {
      syncFromStorage();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SIDEBAR_WIDGET_STATE_CHANGED_EVENT, handleWidgetStateChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SIDEBAR_WIDGET_STATE_CHANGED_EVENT, handleWidgetStateChanged);
    };
  }, []);

  const visibleSidebarItems = useMemo(
    () =>
      sidebarItems.filter((item) => {
        if (!item.widgetKey) return true;
        return widgetVisibility[item.widgetKey] !== false;
      }),
    [widgetVisibility]
  );

  const closeSidebarLink = async (item: SidebarItem) => {
    const widgetKey = item.widgetKey;
    if (!widgetKey) return;
    if (!authToken) return;
    if (widgetControlsLocked) return;
    if (closingWidgetKeys[widgetKey]) return;

    const previousVisible = widgetVisibility[widgetKey] !== false;
    if (!previousVisible) return;

    setClosingWidgetKeys((prev) => ({ ...prev, [widgetKey]: true }));

    try {
      const response = await axios.put(
        '/api/dashboard/widgets/me',
        {
          widget_key: widgetKey,
          is_visible: false,
          lock_widget_controls: false,
        },
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || 'Widget hide not saved');
      }

      const nextVisibility = { ...widgetVisibility, [widgetKey]: false };
      setWidgetVisibility(nextVisibility);

      try {
        localStorage.setItem(SIDEBAR_WIDGET_VISIBILITY_CACHE_KEY, JSON.stringify(nextVisibility));
        const accessCacheKey = `dashboard_access_cache_${authToken.slice(-16)}`;
        const rawAccessCache = localStorage.getItem(accessCacheKey);
        if (rawAccessCache) {
          const parsedAccessCache = JSON.parse(rawAccessCache) as {
            widgetVisibility?: Record<string, boolean>;
          };
          localStorage.setItem(
            accessCacheKey,
            JSON.stringify({
              ...parsedAccessCache,
              widgetVisibility: {
                ...(parsedAccessCache.widgetVisibility || {}),
                [widgetKey]: false,
              },
            })
          );
        }
        window.dispatchEvent(new Event(SIDEBAR_WIDGET_STATE_CHANGED_EVENT));
      } catch {
        // Ignore cache write failures.
      }
    } catch {
      // Keep the link visible if DB update fails.
    } finally {
      setClosingWidgetKeys((prev) => ({ ...prev, [widgetKey]: false }));
    }
  };

  useEffect(() => {
    const activeItem = sidebarItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (!activeItem?.widgetKey) return;
    if (widgetVisibility[activeItem.widgetKey] === false) {
      router.replace('/dashboard');
    }
  }, [pathname, router, widgetVisibility]);

  const currentSectionLabel = useMemo(() => {
    const match = sidebarItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.label || 'Dashboard';
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-teal-950 text-slate-200 shadow-2xl shadow-slate-900/40 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-72'} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden="true" />

        <div className="relative flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-extrabold text-slate-900 shadow-lg shadow-emerald-500/30">
              {companyLogoUrl && !companyLogoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={companyLogoUrl}
                  alt="Company logo"
                  className="h-full w-full bg-white object-contain p-0.5"
                  onError={() => setCompanyLogoFailed(true)}
                />
              ) : (
                'P'
              )}
            </span>
            <div className={`min-w-0 overflow-hidden transition-all ${sidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <p className="truncate text-sm font-bold tracking-wide text-white">Pabasara ERP</p>
              <p className="truncate text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Control center</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white lg:inline-flex"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`}>
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/15 lg:hidden"
            aria-label="Close sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
          {!sidebarCollapsed && (
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Main menu</p>
          )}
          <nav className="space-y-1">
            {widgetLoading
              ? Array.from({ length: sidebarCollapsed ? 7 : 9 }, (_, idx) => (
                  <div
                    key={`sidebar-loading-${idx}`}
                    className="flex items-center gap-3 rounded-xl px-2.5 py-2"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 animate-pulse rounded-lg bg-white/10" />
                    {!sidebarCollapsed && <span className="h-3 w-28 animate-pulse rounded bg-white/10" />}
                  </div>
                ))
              : visibleSidebarItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const isClosing = item.widgetKey ? Boolean(closingWidgetKeys[item.widgetKey]) : false;
              const tone = SIDEBAR_ICON_TONES[item.icon] || 'from-slate-400 to-slate-500';
              return (
                <div
                  key={item.href}
                  className={`group relative flex items-center gap-1 ${isClosing ? 'opacity-60' : ''}`}
                >
                  {isActive && (
                    <span className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-300 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  )}
                  <Link
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                    onClick={(event) => {
                      if (isClosing) event.preventDefault();
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-2.5 py-2 text-sm transition-all duration-200 ${
                      isActive
                        ? 'border-emerald-400/30 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(52,211,153,0.08)]'
                        : 'border-transparent text-slate-300 hover:translate-x-0.5 hover:border-white/10 hover:bg-white/5 hover:text-white'
                    } ${isClosing ? 'pointer-events-none' : ''}`}
                  >
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                        isActive
                          ? `bg-gradient-to-br ${tone} text-white shadow-lg`
                          : 'bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10 group-hover:text-white'
                      }`}
                    >
                      <SidebarIcon icon={item.icon} />
                    </span>
                    {!sidebarCollapsed && (
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{item.label}</span>
                        {item.description ? (
                          <span className={`block truncate text-[11px] leading-4 ${isActive ? 'text-emerald-200/70' : 'text-slate-500 group-hover:text-slate-400'}`}>{item.description}</span>
                        ) : null}
                      </span>
                    )}
                  </Link>

                  {!sidebarCollapsed && item.widgetKey && !widgetControlsLocked && (
                    <button
                      type="button"
                      aria-label={`Close ${item.label} link`}
                      title={`Remove ${item.label} link`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void closeSidebarLink(item);
                      }}
                      disabled={isClosing}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-600 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.5 w-3.5"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="relative shrink-0 border-t border-white/10 p-3">
          <div className={`flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-inset ring-white/10 ${sidebarCollapsed ? 'justify-center px-0' : ''}`}>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            </span>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">System online</p>
                <p className="truncate text-[11px] text-slate-500">Pabasara Sweets BMS</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className={`min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-3 sm:px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 lg:hidden"
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                ==
              </button>
              <span className="text-sm font-semibold text-slate-800">{currentSectionLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden lg:inline-flex rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {sidebarCollapsed ? 'Preview Menu' : 'Hide Menu'}
            </button>
          </div>
        </header>

        <div>{children}</div>
      </div>
    </div>
  );
}
